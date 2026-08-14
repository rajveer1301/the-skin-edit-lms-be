import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Coupon, InvoiceStatus, Prisma } from '@prisma/client';
import { computeCouponDiscount } from '../coupons/coupon.mapper';
import { Paginated } from '../common/interfaces/paginated.interface';
import { getPageParams, paginated } from '../common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInvoiceDto,
  InvoiceItemInputDto,
} from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import {
  INVOICE_INCLUDE,
  InvoiceDto,
  mapInvoice,
  mapPayment,
  PaymentDto,
} from './invoice.mapper';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: InvoiceQueryDto): Promise<Paginated<InvoiceDto>> {
    const params = getPageParams(query);
    const where: Prisma.InvoiceWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.patientId) where.patientId = query.patientId;
    if (query.search) {
      where.OR = [
        { number: { contains: query.search, mode: 'insensitive' } },
        {
          patient: {
            firstName: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          patient: {
            lastName: { contains: query.search, mode: 'insensitive' },
          },
        },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: INVOICE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginated(rows.map(mapInvoice), total, params);
  }

  async findOne(id: string): Promise<InvoiceDto> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return mapInvoice(invoice);
  }

  async create(dto: CreateInvoiceDto): Promise<InvoiceDto> {
    const mappedItems = dto.items.map((i) => ({
      description: i.description,
      serviceId: i.serviceId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: i.quantity * i.unitPrice,
    }));
    const subtotal = mappedItems.reduce((sum, i) => sum + i.total, 0);

    const coupon = await this.resolveCoupon(dto.couponCode, subtotal);
    const couponDiscount = coupon.discount;
    const discount = dto.discount + couponDiscount;
    const total = subtotal - discount + dto.tax;

    const invoice = await this.prisma.invoice.create({
      data: {
        number: await this.nextInvoiceNumber(),
        patientId: dto.patientId,
        subtotal,
        discount,
        tax: dto.tax,
        total,
        amountPaid: 0,
        balance: total,
        status: InvoiceStatus.UNPAID,
        issuedDate: dto.issuedDate,
        dueDate: dto.dueDate,
        notes: dto.notes,
        couponId: coupon.record?.id,
        couponCode: coupon.record?.code,
        items: { create: mappedItems },
      },
      include: INVOICE_INCLUDE,
    });

    if (coupon.record && couponDiscount > 0) {
      await this.prisma.$transaction([
        this.prisma.coupon.update({
          where: { id: coupon.record.id },
          data: { usedCount: { increment: 1 } },
        }),
        this.prisma.couponUsage.create({
          data: {
            couponId: coupon.record.id,
            couponCode: coupon.record.code,
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            patientId: invoice.patientId,
            patientName: invoice.patient
              ? `${invoice.patient.firstName} ${invoice.patient.lastName}`
              : undefined,
            discountAmount: couponDiscount,
          },
        }),
      ]);
    }

    return mapInvoice(invoice);
  }

  /**
   * Looks up a coupon by code and computes its discount against the subtotal.
   * Throws when the code is unknown or not currently applicable.
   */
  private async resolveCoupon(
    code: string | undefined,
    subtotal: number,
  ): Promise<{ record: Coupon | null; discount: number }> {
    if (!code) {
      return { record: null, discount: 0 };
    }
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!coupon) {
      throw new BadRequestException('Invalid coupon code');
    }
    const discount = computeCouponDiscount(coupon, subtotal);
    if (discount <= 0) {
      throw new BadRequestException('Coupon is not applicable to this invoice');
    }
    return { record: coupon, discount };
  }

  async update(id: string, dto: UpdateInvoiceDto): Promise<InvoiceDto> {
    const existing = await this.prisma.invoice.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!existing) {
      throw new NotFoundException('Invoice not found');
    }
    const itemsInput = dto.items ?? [];
    const { subtotal, total, items } = this.computeTotals(
      itemsInput,
      dto.discount ?? existing.discount,
      dto.tax ?? existing.tax,
    );
    const amountPaid = existing.payments.reduce((sum, p) => sum + p.amount, 0);
    await this.prisma.$transaction([
      this.prisma.invoiceItem.deleteMany({ where: { invoiceId: id } }),
      this.prisma.invoice.update({
        where: { id },
        data: {
          patientId: dto.patientId ?? existing.patientId,
          subtotal,
          discount: dto.discount ?? existing.discount,
          tax: dto.tax ?? existing.tax,
          total,
          amountPaid,
          balance: total - amountPaid,
          status: this.resolveStatus(total, amountPaid),
          issuedDate: dto.issuedDate ?? existing.issuedDate,
          dueDate: dto.dueDate ?? existing.dueDate,
          notes: dto.notes ?? existing.notes,
          items: { create: items },
        },
      }),
    ]);
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const count = await this.prisma.invoice.count({ where: { id } });
    if (!count) {
      throw new NotFoundException('Invoice not found');
    }
    await this.prisma.invoice.delete({ where: { id } });
    return { success: true };
  }

  async addPayment(
    invoiceId: string,
    dto: CreatePaymentDto,
  ): Promise<InvoiceDto> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    await this.prisma.payment.create({
      data: {
        invoiceId,
        amount: dto.amount,
        method: dto.method,
        date: dto.date,
        reference: dto.reference,
        note: dto.note,
      },
    });
    const amountPaid =
      invoice.payments.reduce((sum, p) => sum + p.amount, 0) + dto.amount;
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid,
        balance: invoice.total - amountPaid,
        status: this.resolveStatus(invoice.total, amountPaid),
      },
    });
    return this.findOne(invoiceId);
  }

  async allPayments(query: InvoiceQueryDto): Promise<Paginated<PaymentDto>> {
    const params = getPageParams(query);
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        orderBy: { date: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.payment.count(),
    ]);
    return paginated(rows.map(mapPayment), total, params);
  }

  private computeTotals(
    items: InvoiceItemInputDto[],
    discount: number,
    tax: number,
  ) {
    const mapped = items.map((i) => ({
      description: i.description,
      serviceId: i.serviceId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: i.quantity * i.unitPrice,
    }));
    const subtotal = mapped.reduce((sum, i) => sum + i.total, 0);
    const total = subtotal - discount + tax;
    return { subtotal, total, items: mapped };
  }

  private resolveStatus(total: number, amountPaid: number): InvoiceStatus {
    if (amountPaid <= 0) return InvoiceStatus.UNPAID;
    if (total - amountPaid <= 0) return InvoiceStatus.PAID;
    return InvoiceStatus.PARTIAL;
  }

  private async nextInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.invoice.count();
    return `INV-${year}-${String(count + 1).padStart(3, '0')}`;
  }
}

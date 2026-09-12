import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Coupon, InvoiceStatus, PaymentKind, Prisma } from '@prisma/client';
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
import { UpdatePaymentDto } from './dto/update-payment.dto';
import {
  INVOICE_INCLUDE,
  InvoiceDto,
  mapInvoice,
  mapPayment,
  PaymentDto,
  PaymentReceiptDto,
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
      productId: i.productId,
      hsnSac: i.hsnSac,
      gstPercent: i.gstPercent,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: i.quantity * i.unitPrice,
    }));
    const subtotal = mappedItems.reduce((sum, i) => sum + i.total, 0);

    const coupon = await this.resolveCoupon(dto.couponCode, subtotal);
    const couponDiscount = coupon.discount;
    const discount = Math.max(dto.discount, couponDiscount);
    const roundOff = dto.roundOff ?? 0;
    const total = subtotal - discount + dto.tax + roundOff;

    const invoice = await this.prisma.invoice.create({
      data: {
        number: await this.nextInvoiceNumber(),
        patientId: dto.patientId,
        billedToName: dto.billedToName,
        appointmentId: dto.appointmentId,
        treatmentId: dto.treatmentId,
        subtotal,
        discount,
        tax: dto.tax,
        cgst: dto.cgst,
        sgst: dto.sgst,
        roundOff,
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
    usedCountAdjust = 0,
  ): Promise<{ record: Coupon | null; discount: number }> {
    if (!code?.trim()) {
      return { record: null, discount: 0 };
    }
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!coupon) {
      throw new BadRequestException('Invalid coupon code');
    }
    const discount = computeCouponDiscount(
      coupon,
      subtotal,
      coupon.usedCount + usedCountAdjust,
    );
    if (discount <= 0) {
      throw new BadRequestException('Coupon is not applicable to this invoice');
    }
    return { record: coupon, discount };
  }

  async update(id: string, dto: UpdateInvoiceDto): Promise<InvoiceDto> {
    const existing = await this.prisma.invoice.findUnique({
      where: { id },
      include: { payments: true, patient: true },
    });
    if (!existing) {
      throw new NotFoundException('Invoice not found');
    }
    const itemsInput = dto.items ?? [];
    const subtotal = itemsInput.reduce(
      (sum, i) => sum + i.quantity * i.unitPrice,
      0,
    );
    const requestedCode =
      dto.couponCode === undefined
        ? existing.couponCode ?? undefined
        : dto.couponCode.trim() || undefined;
    const sameCoupon =
      !!requestedCode &&
      requestedCode.trim().toUpperCase() ===
        (existing.couponCode ?? '').toUpperCase();
    const coupon = await this.resolveCoupon(
      requestedCode,
      subtotal,
      sameCoupon ? -1 : 0,
    );
    const couponDiscount = coupon.discount;
    const discount = Math.max(dto.discount ?? existing.discount, couponDiscount);
    const tax = dto.tax ?? existing.tax;
    const roundOff = dto.roundOff ?? existing.roundOff;
    const { total, items } = this.computeTotals(
      itemsInput,
      discount,
      tax,
      roundOff,
    );
    const amountPaid = existing.payments.reduce((sum, p) => sum + p.amount, 0);
    const existingUsage = await this.prisma.couponUsage.findFirst({
      where: { invoiceId: id },
    });
    const patientName = existing.patient
      ? `${existing.patient.firstName} ${existing.patient.lastName}`
      : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.update({
        where: { id },
        data: {
          patientId: dto.patientId ?? existing.patientId,
          billedToName: dto.billedToName ?? existing.billedToName,
          appointmentId: dto.appointmentId ?? existing.appointmentId,
          treatmentId: dto.treatmentId ?? existing.treatmentId,
          subtotal,
          discount,
          tax,
          cgst: dto.cgst ?? existing.cgst,
          sgst: dto.sgst ?? existing.sgst,
          roundOff,
          total,
          amountPaid,
          balance: total - amountPaid,
          status: this.resolveStatus(total, amountPaid),
          issuedDate: dto.issuedDate ?? existing.issuedDate,
          dueDate: dto.dueDate ?? existing.dueDate,
          notes: dto.notes ?? existing.notes,
          couponId: coupon.record?.id ?? null,
          couponCode: coupon.record?.code ?? null,
          items: { create: items },
        },
      });

      if (existing.couponId !== (coupon.record?.id ?? null)) {
        if (existing.couponId) {
          const previous = await tx.coupon.findUnique({
            where: { id: existing.couponId },
          });
          if (previous) {
            await tx.coupon.update({
              where: { id: previous.id },
              data: { usedCount: Math.max(0, previous.usedCount - 1) },
            });
          }
        }
        if (existingUsage) {
          await tx.couponUsage.delete({ where: { id: existingUsage.id } });
        }
        if (coupon.record && couponDiscount > 0) {
          await tx.coupon.update({
            where: { id: coupon.record.id },
            data: { usedCount: { increment: 1 } },
          });
          await tx.couponUsage.create({
            data: {
              couponId: coupon.record.id,
              couponCode: coupon.record.code,
              invoiceId: id,
              invoiceNumber: existing.number,
              patientId: existing.patientId,
              patientName,
              discountAmount: couponDiscount,
            },
          });
        }
      } else if (coupon.record && existingUsage) {
        await tx.couponUsage.update({
          where: { id: existingUsage.id },
          data: { discountAmount: couponDiscount },
        });
      } else if (coupon.record && couponDiscount > 0 && !existingUsage) {
        await tx.coupon.update({
          where: { id: coupon.record.id },
          data: { usedCount: { increment: 1 } },
        });
        await tx.couponUsage.create({
          data: {
            couponId: coupon.record.id,
            couponCode: coupon.record.code,
            invoiceId: id,
            invoiceNumber: existing.number,
            patientId: existing.patientId,
            patientName,
            discountAmount: couponDiscount,
          },
        });
      }
    });
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
        receiptNumber: await this.nextReceiptNumber(),
        paymentKind:
          dto.paymentKind ??
          this.derivePaymentKind(
            invoice.payments.length,
            invoice.total -
              invoice.payments.reduce((sum, p) => sum + p.amount, 0) -
              dto.amount,
          ),
        instalmentNumber:
          dto.instalmentNumber ?? invoice.payments.length + 1,
        instalmentOf: dto.instalmentOf,
      },
    });
    return this.syncInvoiceTotals(invoiceId);
  }

  async findPaymentReceipt(id: string): Promise<PaymentReceiptDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: {
          include: {
            patient: true,
            items: true,
            payments: { orderBy: [{ date: 'asc' }, { id: 'asc' }] },
          },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    const ordered = payment.invoice.payments;
    const index = ordered.findIndex((p) => p.id === payment.id);
    const receivedToDate = ordered
      .slice(0, index + 1)
      .reduce((sum, p) => sum + p.amount, 0);
    const remainingAfter = payment.invoice.total - receivedToDate;
    const patient = payment.invoice.patient;
    const serviceSummary = payment.invoice.items
      .map((item) => item.description.trim())
      .filter(Boolean)
      .join(', ');
    return {
      ...mapPayment(payment),
      paymentKind:
        payment.paymentKind ??
        this.derivePaymentKind(index, remainingAfter),
      instalmentNumber: payment.instalmentNumber ?? index + 1,
      invoiceNumber: payment.invoice.number,
      patientName: patient
        ? `${patient.firstName} ${patient.lastName}`
        : '',
      billedToName: payment.invoice.billedToName ?? undefined,
      serviceSummary: serviceSummary || undefined,
      invoiceTotal: payment.invoice.total,
      receivedToDate,
      remainingAfter,
    };
  }

  async updatePayment(id: string, dto: UpdatePaymentDto): Promise<InvoiceDto> {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    await this.prisma.payment.update({
      where: { id },
      data: {
        amount: dto.amount ?? payment.amount,
        method: dto.method ?? payment.method,
        date: dto.date ?? payment.date,
        reference: dto.reference !== undefined ? dto.reference : payment.reference,
        note: dto.note !== undefined ? dto.note : payment.note,
        paymentKind: dto.paymentKind ?? payment.paymentKind,
        instalmentNumber:
          dto.instalmentNumber ?? payment.instalmentNumber,
        instalmentOf:
          dto.instalmentOf !== undefined
            ? dto.instalmentOf
            : payment.instalmentOf,
      },
    });
    return this.syncInvoiceTotals(payment.invoiceId);
  }

  private async syncInvoiceTotals(invoiceId: string): Promise<InvoiceDto> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    const amountPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
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
    roundOff = 0,
  ) {
    const mapped = items.map((i) => ({
      description: i.description,
      serviceId: i.serviceId,
      productId: i.productId,
      hsnSac: i.hsnSac,
      gstPercent: i.gstPercent,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: i.quantity * i.unitPrice,
    }));
    const subtotal = mapped.reduce((sum, i) => sum + i.total, 0);
    const total = subtotal - discount + tax + roundOff;
    return { subtotal, total, items: mapped };
  }

  private resolveStatus(total: number, amountPaid: number): InvoiceStatus {
    if (amountPaid <= 0) return InvoiceStatus.UNPAID;
    if (total - amountPaid <= 0) return InvoiceStatus.PAID;
    return InvoiceStatus.PARTIAL;
  }

  private derivePaymentKind(
    paymentIndex: number,
    remainingAfter: number,
  ): PaymentKind {
    if (remainingAfter <= 0) return PaymentKind.FINAL;
    if (paymentIndex === 0) return PaymentKind.ADVANCE;
    return PaymentKind.INSTALMENT;
  }

  private async nextInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.invoice.count();
    return `INV-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  private async nextReceiptNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.payment.count();
    return `RCP-${year}-${String(count + 1).padStart(3, '0')}`;
  }
}

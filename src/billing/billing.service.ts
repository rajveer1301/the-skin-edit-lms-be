import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Coupon,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  PaymentKind,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { Paginated } from '../common/interfaces/paginated.interface';
import { getPageParams, paginated } from '../common/utils/pagination';
import { cents, lineTotal, money, sumMoney } from '../common/utils/money';
import { clinicDay } from '../common/utils/dates';
import { serializable } from '../common/utils/transaction';
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

type Tx = Prisma.TransactionClient;
type ExistingInvoice = Invoice & {
  items: InvoiceItem[];
  payments: { amount: number }[];
};
const changed = <T>(value: T | undefined, fallback: T): T =>
  value === undefined ? fallback : value;

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: InvoiceQueryDto): Promise<Paginated<InvoiceDto>> {
    const params = getPageParams(query);
    const where = this.invoiceWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: INVOICE_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
    if (!invoice) throw new NotFoundException('Invoice not found');
    return mapInvoice(invoice);
  }

  async create(dto: CreateInvoiceDto): Promise<InvoiceDto> {
    const requestHash = this.hash(dto);
    return serializable(this.prisma, async (tx) => {
      if (dto.idempotencyKey) {
        const previous = await tx.invoice.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: INVOICE_INCLUDE,
        });
        if (previous) {
          if (previous.requestHash !== requestHash)
            throw new ConflictException(
              'Idempotency key was used for a different invoice',
            );
          return mapInvoice(previous);
        }
      }
      const data = await this.prepare(tx, dto);
      const invoice = await tx.invoice.create({
        data: {
          ...data,
          number: await this.nextNumber(tx, 'INV'),
          amountPaid: 0,
          balance: data.total,
          status: this.resolveStatus(data.total, 0),
          idempotencyKey: dto.idempotencyKey,
          requestHash,
        },
        include: INVOICE_INCLUDE,
      });
      await this.recordCoupon(tx, invoice);
      return mapInvoice(invoice);
    });
  }

  async update(id: string, dto: UpdateInvoiceDto): Promise<InvoiceDto> {
    return serializable(this.prisma, async (tx) => {
      const existing = await tx.invoice.findUnique({
        where: { id },
        include: { items: true, payments: { select: { amount: true } } },
      });
      if (!existing) throw new NotFoundException('Invoice not found');
      if (existing.status === InvoiceStatus.CANCELLED)
        throw new BadRequestException('Cancelled invoices cannot be edited');
      if (
        dto.patientId &&
        dto.patientId !== existing.patientId &&
        existing.payments.length
      )
        throw new BadRequestException(
          'A paid invoice cannot be reassigned to another patient',
        );
      const data = await this.prepare(tx, dto, existing);
      const amountPaid = sumMoney(existing.payments.map((p) => p.amount));
      if (dto.items !== undefined)
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      const invoice = await tx.invoice.update({
        where: { id },
        data: {
          ...data,
          items: dto.items === undefined ? undefined : data.items,
          amountPaid,
          balance: sumMoney([data.total, -amountPaid]),
          status: this.resolveStatus(data.total, amountPaid),
        },
        include: INVOICE_INCLUDE,
      });
      await this.recordCoupon(tx, invoice, existing.couponId);
      return mapInvoice(invoice);
    });
  }

  async remove(id: string): Promise<{ success: boolean }> {
    return serializable(this.prisma, async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: { _count: { select: { payments: true } } },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice._count.payments)
        throw new BadRequestException(
          'Invoices with payments cannot be deleted',
        );
      await tx.couponUsage.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.delete({ where: { id } });
      if (invoice.couponId) await this.syncCouponCount(tx, invoice.couponId);
      return { success: true };
    });
  }

  async addPayment(
    invoiceId: string,
    dto: CreatePaymentDto,
  ): Promise<InvoiceDto> {
    const requestHash = this.hash(dto);
    return serializable(this.prisma, async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (
        invoice.status === InvoiceStatus.CANCELLED ||
        invoice.status === InvoiceStatus.DRAFT
      )
        throw new BadRequestException('This invoice cannot receive payments');
      if (dto.idempotencyKey) {
        const previous = await tx.payment.findUnique({
          where: {
            invoiceId_idempotencyKey: {
              invoiceId,
              idempotencyKey: dto.idempotencyKey,
            },
          },
        });
        if (previous) {
          if (previous.requestHash !== requestHash)
            throw new ConflictException(
              'Idempotency key was used for a different payment',
            );
          return mapInvoice(
            await tx.invoice.findUniqueOrThrow({
              where: { id: invoiceId },
              include: INVOICE_INCLUDE,
            }),
          );
        }
      }
      const paid = await tx.payment.aggregate({
        where: { invoiceId },
        _sum: { amount: true },
        _count: { _all: true },
      });
      const amount = money(dto.amount);
      if (amount <= 0)
        throw new BadRequestException('Payment amount must be positive');
      const remaining = sumMoney([
        invoice.total,
        -(paid._sum.amount ?? 0),
        -amount,
      ]);
      this.validateInstalments(dto.instalmentNumber, dto.instalmentOf);
      await tx.payment.create({
        data: {
          invoiceId,
          amount,
          method: dto.method,
          date: dto.date,
          reference: dto.reference,
          note: dto.note,
          receiptNumber: await this.nextNumber(tx, 'RCP'),
          paymentKind:
            dto.paymentKind ??
            this.derivePaymentKind(paid._count._all, remaining),
          instalmentNumber: dto.instalmentNumber ?? paid._count._all + 1,
          instalmentOf: dto.instalmentOf,
          idempotencyKey: dto.idempotencyKey,
          requestHash,
        },
      });
      return this.syncInvoiceTotals(tx, invoiceId);
    });
  }

  async updatePayment(id: string, dto: UpdatePaymentDto): Promise<InvoiceDto> {
    return serializable(this.prisma, async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id } });
      if (!payment) throw new NotFoundException('Payment not found');
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: payment.invoiceId },
      });
      if (invoice.status === InvoiceStatus.CANCELLED)
        throw new BadRequestException(
          'Cancelled invoice payments cannot be edited',
        );
      const amount = money(dto.amount ?? payment.amount);
      if (amount <= 0)
        throw new BadRequestException('Payment amount must be positive');
      this.validateInstalments(
        dto.instalmentNumber ?? payment.instalmentNumber,
        changed(dto.instalmentOf, payment.instalmentOf),
      );
      await tx.payment.update({
        where: { id },
        data: {
          amount,
          method: dto.method,
          date: dto.date,
          reference: dto.reference,
          note: dto.note,
          paymentKind: dto.paymentKind,
          instalmentNumber: dto.instalmentNumber,
          instalmentOf: dto.instalmentOf,
        },
      });
      return this.syncInvoiceTotals(tx, payment.invoiceId);
    });
  }

  async findPaymentReceipt(id: string): Promise<PaymentReceiptDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: {
          include: {
            ...INVOICE_INCLUDE,
            payments: { orderBy: [{ date: 'asc' }, { id: 'asc' }] },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    const index = payment.invoice.payments.findIndex((p) => p.id === id);
    const receivedToDate = sumMoney(
      payment.invoice.payments.slice(0, index + 1).map((p) => p.amount),
    );
    const remainingAfter = sumMoney([payment.invoice.total, -receivedToDate]);
    return {
      ...mapPayment(payment),
      paymentKind:
        payment.paymentKind ?? this.derivePaymentKind(index, remainingAfter),
      instalmentNumber: payment.instalmentNumber ?? index + 1,
      invoiceNumber: payment.invoice.number,
      patientName: `${payment.invoice.patient.firstName} ${payment.invoice.patient.lastName}`,
      billedToName: payment.invoice.billedToName ?? undefined,
      serviceSummary:
        payment.invoice.items
          .map((i) => i.description.trim())
          .filter(Boolean)
          .join(', ') || undefined,
      invoiceTotal: payment.invoice.total,
      receivedToDate,
      remainingAfter,
    };
  }

  async allPayments(query: InvoiceQueryDto): Promise<Paginated<PaymentDto>> {
    const params = getPageParams(query);
    const where: Prisma.PaymentWhereInput = {
      invoice: this.invoiceWhere(query),
    };
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return paginated(rows.map(mapPayment), total, params);
  }

  private invoiceWhere(query: InvoiceQueryDto): Prisma.InvoiceWhereInput {
    return {
      status: query.status,
      patientId: query.patientId,
      ...(query.search
        ? {
            OR: [
              {
                number: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                patient: {
                  firstName: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                patient: {
                  lastName: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private async prepare(
    tx: Tx,
    dto: UpdateInvoiceDto,
    existing?: ExistingInvoice,
  ) {
    const patientId = dto.patientId ?? existing!.patientId;
    const input: Array<InvoiceItemInputDto | InvoiceItem> =
      dto.items ?? existing?.items ?? [];
    const items = input.map((i) => ({
      description: i.description,
      serviceId: i.serviceId || undefined,
      productId: i.productId || undefined,
      planItemId: i.planItemId || undefined,
      hsnSac: i.hsnSac ?? undefined,
      gstPercent: i.gstPercent ?? undefined,
      quantity: i.quantity,
      unitPrice: money(i.unitPrice),
      total: lineTotal(i.quantity, i.unitPrice),
    }));
    if (
      !items.length ||
      items.some(
        (i) =>
          !Number.isInteger(i.quantity) || i.quantity <= 0 || i.unitPrice < 0,
      )
    )
      throw new BadRequestException(
        'Invoice needs positive integer quantities and nonnegative prices',
      );
    const planId = changed(dto.planId, existing?.planId ?? undefined) || null;
    const appointmentId =
      changed(dto.appointmentId, existing?.appointmentId ?? undefined) || null;
    const treatmentId =
      changed(dto.treatmentId, existing?.treatmentId ?? undefined) || null;
    await this.assertLinks(
      tx,
      patientId,
      planId,
      appointmentId,
      treatmentId,
      items,
    );
    const subtotal = sumMoney(items.map((i) => i.total));
    const code =
      changed(dto.couponCode, existing?.couponCode ?? undefined)
        ?.trim()
        .toUpperCase() || null;
    const sameCoupon = !!code && code === existing?.couponCode;
    let coupon: Coupon | null = null;
    let couponDiscount = 0;
    let couponSnapshot: Prisma.InputJsonValue | typeof Prisma.DbNull =
      Prisma.DbNull;
    if (code) {
      coupon = await tx.coupon.findUnique({ where: { code } });
      if (!coupon) throw new BadRequestException('Invalid coupon code');
      const financialChange =
        dto.items !== undefined || patientId !== existing?.patientId;
      if (!sameCoupon || financialChange)
        await this.validateCoupon(
          tx,
          coupon,
          patientId,
          subtotal,
          items,
          existing?.id,
        );
      if (sameCoupon && !financialChange) {
        couponDiscount = existing.couponDiscount;
        couponSnapshot = (existing.couponSnapshot as Prisma.InputJsonValue) ?? {
          type: coupon.type,
          value: coupon.value,
        };
      } else {
        const snapshot =
          sameCoupon && existing?.couponSnapshot
            ? (existing.couponSnapshot as { type: string; value: number })
            : coupon;
        couponDiscount = Math.min(
          subtotal,
          money(
            snapshot.type === 'PERCENT'
              ? new Prisma.Decimal(subtotal)
                  .mul(snapshot.value)
                  .div(100)
                  .toNumber()
              : snapshot.value,
          ),
        );
        couponSnapshot = { type: snapshot.type, value: snapshot.value };
      }
    }
    // Older clients round-trip the combined discount. Do not reinterpret it as manual.
    const manualDiscount = money(
      dto.discount === undefined ||
        (existing && dto.discount === existing.discount)
        ? (existing?.manualDiscount ?? 0)
        : dto.discount,
    );
    const discount = Math.max(manualDiscount, couponDiscount);
    if (manualDiscount < 0 || discount > subtotal)
      throw new BadRequestException('Discount cannot exceed subtotal');
    const tax = money(dto.tax ?? existing?.tax ?? 0);
    const roundOff = money(dto.roundOff ?? existing?.roundOff ?? 0);
    const cgst = changed(dto.cgst, existing?.cgst ?? undefined);
    const sgst = changed(dto.sgst, existing?.sgst ?? undefined);
    if (tax < 0 || (cgst != null && cgst < 0) || (sgst != null && sgst < 0))
      throw new BadRequestException('Tax cannot be negative');
    if (
      cgst != null &&
      sgst != null &&
      cents(sumMoney([cgst, sgst])) !== cents(tax)
    )
      throw new BadRequestException('CGST and SGST must add up to tax');
    const total = sumMoney([subtotal, -discount, tax, roundOff]);
    if (total < 0)
      throw new BadRequestException('Invoice total cannot be negative');
    return {
      patientId,
      planId,
      appointmentId,
      treatmentId,
      subtotal,
      manualDiscount,
      couponDiscount,
      discount,
      tax,
      cgst,
      sgst,
      roundOff,
      total,
      couponId: coupon?.id ?? null,
      couponCode: code,
      couponSnapshot,
      billedToName: changed(
        dto.billedToName,
        existing?.billedToName ?? undefined,
      ),
      issuedDate: dto.issuedDate ?? existing!.issuedDate,
      dueDate: changed(dto.dueDate, existing?.dueDate ?? undefined),
      notes: changed(dto.notes, existing?.notes ?? undefined),
      items: { create: items },
    };
  }

  private async assertLinks(
    tx: Tx,
    patientId: string,
    planId: string | null,
    appointmentId: string | null,
    treatmentId: string | null,
    items: InvoiceItemInputDto[],
  ) {
    if (appointmentId) {
      const appointment = await tx.appointment.findUnique({
        where: { id: appointmentId },
        select: { patientId: true },
      });
      if (appointment?.patientId !== patientId)
        throw new BadRequestException(
          'Appointment does not belong to this patient',
        );
    }
    if (treatmentId) {
      const treatment = await tx.treatment.findUnique({
        where: { id: treatmentId },
        select: { patientId: true },
      });
      if (treatment?.patientId !== patientId)
        throw new BadRequestException(
          'Treatment does not belong to this patient',
        );
    }
    if (items.some((i) => i.planItemId) && !planId)
      throw new BadRequestException('planId is required for plan items');
    if (planId) {
      const plan = await tx.treatmentPlan.findUnique({
        where: { id: planId },
        include: { items: { select: { id: true, serviceId: true } } },
      });
      if (plan?.patientId !== patientId)
        throw new BadRequestException(
          'Treatment plan does not belong to this patient',
        );
      const allowed = new Map(plan.items.map((i) => [i.id, i.serviceId]));
      for (const item of items.filter((i) => i.planItemId)) {
        const service = allowed.get(item.planItemId!);
        if (!service || (item.serviceId && item.serviceId !== service))
          throw new BadRequestException(
            'Invoice service does not match its plan item',
          );
        item.serviceId = service;
      }
    }
    const services = [
      ...new Set(items.flatMap((i) => (i.serviceId ? [i.serviceId] : []))),
    ];
    if (
      services.length &&
      (await tx.clinicService.count({ where: { id: { in: services } } })) !==
        services.length
    )
      throw new BadRequestException('Unknown invoice service');
  }

  private async validateCoupon(
    tx: Tx,
    coupon: Coupon,
    patientId: string,
    subtotal: number,
    items: InvoiceItemInputDto[],
    invoiceId?: string,
  ) {
    const today = clinicDay();
    if (
      !coupon.active ||
      (coupon.validFrom && today < coupon.validFrom) ||
      (coupon.validTo && today > coupon.validTo) ||
      subtotal < (coupon.minAmount ?? 0)
    )
      throw new BadRequestException('Coupon is not applicable');
    const where = {
      couponId: coupon.id,
      ...(invoiceId ? { NOT: { invoiceId } } : {}),
    };
    const used = await tx.couponUsage.count({ where });
    if (coupon.maxUses != null && used >= coupon.maxUses)
      throw new BadRequestException('Coupon usage limit reached');
    if (
      coupon.maxUsesPerPatient != null &&
      (await tx.couponUsage.count({ where: { ...where, patientId } })) >=
        coupon.maxUsesPerPatient
    )
      throw new BadRequestException('Patient coupon usage limit reached');
    if (coupon.firstVisitOnly) {
      const visits = await tx.appointment.count({
        where: { patientId, status: 'COMPLETED' },
      });
      const invoices = await tx.invoice.count({
        where: {
          patientId,
          id: invoiceId ? { not: invoiceId } : undefined,
          status: { notIn: ['DRAFT', 'CANCELLED'] },
        },
      });
      if (visits || invoices)
        throw new BadRequestException(
          'Coupon is only available on the first visit',
        );
    }
    if (coupon.applicableCategory || coupon.packageOnly) {
      const ids = [
        ...new Set(items.flatMap((i) => (i.serviceId ? [i.serviceId] : []))),
      ];
      const services = await tx.clinicService.findMany({
        where: { id: { in: ids } },
        select: { id: true, category: true, isPackage: true },
      });
      const byId = new Map(services.map((s) => [s.id, s]));
      const planIds = items.flatMap((i) =>
        i.planItemId ? [i.planItemId] : [],
      );
      const planItems = await tx.treatmentPlanItem.findMany({
        where: { id: { in: planIds } },
        select: { id: true, kind: true },
      });
      const packages = new Set(
        planItems.filter((p) => p.kind === 'PACKAGE').map((p) => p.id),
      );
      if (
        items.some((i) => {
          const service = byId.get(i.serviceId ?? '');
          return (
            !service ||
            !!i.productId ||
            (coupon.applicableCategory &&
              service.category !== coupon.applicableCategory) ||
            (coupon.packageOnly &&
              !(i.planItemId ? packages.has(i.planItemId) : service.isPackage))
          );
        })
      )
        throw new BadRequestException(
          'Every discounted line must satisfy the coupon category/package restriction',
        );
    }
  }

  private async recordCoupon(
    tx: Tx,
    invoice: Invoice,
    previousCouponId?: string | null,
  ) {
    if (!invoice.couponId && !previousCouponId) return;
    if (invoice.couponId && invoice.couponDiscount > 0) {
      const patient = await tx.patient.findUniqueOrThrow({
        where: { id: invoice.patientId },
        select: { firstName: true, lastName: true },
      });
      const data = {
        couponId: invoice.couponId,
        couponCode: invoice.couponCode!,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        patientId: invoice.patientId,
        patientName: `${patient.firstName} ${patient.lastName}`,
        discountAmount: invoice.couponDiscount,
      };
      await tx.couponUsage.upsert({
        where: { invoiceId: invoice.id },
        create: data,
        update: {
          ...data,
          usedAt:
            previousCouponId && previousCouponId !== invoice.couponId
              ? new Date()
              : undefined,
        },
      });
    } else
      await tx.couponUsage.deleteMany({ where: { invoiceId: invoice.id } });
    for (const id of new Set(
      [previousCouponId, invoice.couponId].filter((id): id is string => !!id),
    ))
      await this.syncCouponCount(tx, id);
  }
  private async syncCouponCount(tx: Tx, id: string) {
    const usedCount = await tx.couponUsage.count({ where: { couponId: id } });
    await tx.coupon.update({ where: { id }, data: { usedCount } });
  }
  private async syncInvoiceTotals(
    tx: Tx,
    invoiceId: string,
  ): Promise<InvoiceDto> {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const payments = await tx.payment.aggregate({
      where: { invoiceId },
      _sum: { amount: true },
    });
    const amountPaid = money(payments._sum.amount ?? 0);
    return mapInvoice(
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          amountPaid,
          balance: sumMoney([invoice.total, -amountPaid]),
          status: this.resolveStatus(invoice.total, amountPaid),
        },
        include: INVOICE_INCLUDE,
      }),
    );
  }
  private resolveStatus(total: number, paid: number): InvoiceStatus {
    if (cents(paid) >= cents(total)) return InvoiceStatus.PAID;
    return cents(paid) <= 0 ? InvoiceStatus.UNPAID : InvoiceStatus.PARTIAL;
  }
  private derivePaymentKind(index: number, remaining: number): PaymentKind {
    return cents(remaining) <= 0
      ? PaymentKind.FINAL
      : index === 0
        ? PaymentKind.ADVANCE
        : PaymentKind.INSTALMENT;
  }
  private validateInstalments(number?: number | null, of?: number | null) {
    if (number != null && of != null && number > of)
      throw new BadRequestException(
        'Instalment number cannot exceed instalment count',
      );
  }
  private async nextNumber(tx: Tx, prefix: 'INV' | 'RCP'): Promise<string> {
    const name = `${prefix}-${clinicDay().slice(0, 4)}`;
    const counter = await tx.numberCounter.upsert({
      where: { name },
      create: { name, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `${name}-${String(counter.value).padStart(3, '0')}`;
  }
  private hash(value: object): string {
    const canonical = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.map(canonical);
      if (input && typeof input === 'object')
        return Object.fromEntries(
          Object.entries(input)
            .filter(([, value]) => value !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => [key, canonical(value)]),
        );
      return input;
    };
    return createHash('sha256')
      .update(JSON.stringify(canonical(value)))
      .digest('hex');
  }
}

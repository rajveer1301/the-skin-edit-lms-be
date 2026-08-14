import { Invoice, InvoiceItem, Patient, Payment } from '@prisma/client';

export type InvoiceWithRelations = Invoice & {
  patient?: Patient | null;
  items?: InvoiceItem[];
  payments?: Payment[];
};

export interface InvoiceItemDto {
  description: string;
  serviceId?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface PaymentDto {
  id: string;
  invoiceId: string;
  amount: number;
  method: string;
  date: string;
  reference?: string;
  note?: string;
}

export interface InvoiceDto {
  id: string;
  number: string;
  patientId: string;
  patientName: string;
  items: InvoiceItemDto[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  balance: number;
  status: string;
  issuedDate: string;
  dueDate?: string;
  couponId?: string;
  couponCode?: string;
  payments: PaymentDto[];
  notes?: string;
}

export const INVOICE_INCLUDE = {
  patient: true,
  items: true,
  payments: true,
} as const;

export function mapPayment(p: Payment): PaymentDto {
  return {
    id: p.id,
    invoiceId: p.invoiceId,
    amount: p.amount,
    method: p.method,
    date: p.date,
    reference: p.reference ?? undefined,
    note: p.note ?? undefined,
  };
}

export function mapInvoiceItem(i: InvoiceItem): InvoiceItemDto {
  return {
    description: i.description,
    serviceId: i.serviceId ?? undefined,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    total: i.total,
  };
}

export function mapInvoice(inv: InvoiceWithRelations): InvoiceDto {
  return {
    id: inv.id,
    number: inv.number,
    patientId: inv.patientId,
    patientName: inv.patient
      ? `${inv.patient.firstName} ${inv.patient.lastName}`
      : '',
    items: (inv.items ?? []).map(mapInvoiceItem),
    subtotal: inv.subtotal,
    discount: inv.discount,
    tax: inv.tax,
    total: inv.total,
    amountPaid: inv.amountPaid,
    balance: inv.balance,
    status: inv.status,
    issuedDate: inv.issuedDate,
    dueDate: inv.dueDate ?? undefined,
    couponId: inv.couponId ?? undefined,
    couponCode: inv.couponCode ?? undefined,
    payments: (inv.payments ?? []).map(mapPayment),
    notes: inv.notes ?? undefined,
  };
}

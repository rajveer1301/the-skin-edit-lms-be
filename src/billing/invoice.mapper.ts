import { Invoice, InvoiceItem, Patient, Payment } from '@prisma/client';

export type InvoiceWithRelations = Invoice & {
  patient?: Patient | null;
  items?: InvoiceItem[];
  payments?: Payment[];
};

export interface InvoiceItemDto {
  description: string;
  serviceId?: string;
  productId?: string;
  hsnSac?: string;
  gstPercent?: number;
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
  receiptNumber?: string;
  paymentKind?: string;
  instalmentNumber?: number;
  instalmentOf?: number;
}

export interface PaymentReceiptDto extends PaymentDto {
  invoiceNumber: string;
  patientName: string;
  billedToName?: string;
  serviceSummary?: string;
  invoiceTotal: number;
  receivedToDate: number;
  remainingAfter: number;
}

export interface InvoiceDto {
  id: string;
  number: string;
  patientId: string;
  patientName: string;
  billedToName?: string;
  appointmentId?: string;
  treatmentId?: string;
  items: InvoiceItemDto[];
  subtotal: number;
  discount: number;
  tax: number;
  cgst?: number;
  sgst?: number;
  roundOff?: number;
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
};

export function mapPayment(p: Payment): PaymentDto {
  return {
    id: p.id,
    invoiceId: p.invoiceId,
    amount: p.amount,
    method: p.method,
    date: p.date,
    reference: p.reference ?? undefined,
    note: p.note ?? undefined,
    receiptNumber: p.receiptNumber ?? undefined,
    paymentKind: p.paymentKind ?? undefined,
    instalmentNumber: p.instalmentNumber ?? undefined,
    instalmentOf: p.instalmentOf ?? undefined,
  };
}

export function mapInvoiceItem(i: InvoiceItem): InvoiceItemDto {
  return {
    description: i.description,
    serviceId: i.serviceId ?? undefined,
    productId: i.productId ?? undefined,
    hsnSac: i.hsnSac ?? undefined,
    gstPercent: i.gstPercent ?? undefined,
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
    billedToName: inv.billedToName ?? undefined,
    appointmentId: inv.appointmentId ?? undefined,
    treatmentId: inv.treatmentId ?? undefined,
    items: (inv.items ?? []).map(mapInvoiceItem),
    subtotal: inv.subtotal,
    discount: inv.discount,
    tax: inv.tax,
    cgst: inv.cgst ?? undefined,
    sgst: inv.sgst ?? undefined,
    roundOff: inv.roundOff ?? undefined,
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

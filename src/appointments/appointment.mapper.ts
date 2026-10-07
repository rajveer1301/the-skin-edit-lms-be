import { Appointment, ClinicService, Patient } from '@prisma/client';

export type AppointmentWithRelations = Appointment & {
  patient?: Pick<Patient, 'firstName' | 'lastName'> | null;
  service?: Pick<ClinicService, 'name'> | null;
};

export interface AppointmentDto {
  id: string;
  patientId: string;
  patientName: string;
  serviceId?: string;
  serviceName?: string;
  visitType: string;
  chiefComplaint?: string;
  treatmentArea?: string;
  sessionNumber?: number;
  totalSessions?: number;
  consentStatus?: string;
  patchTestStatus?: string;
  room?: string;
  bookingSource?: string;
  reminderChannel?: string;
  depositExpected?: number;
  treatmentId?: string;
  invoiceId?: string;
  decision: string;
  followUpDate?: string;
  startTime: string;
  endTime: string;
  status: string;
  notes?: string;
  createdAt?: string;
}

export const APPOINTMENT_INCLUDE = {
  patient: { select: { firstName: true, lastName: true } },
  service: { select: { name: true } },
} as const;

export function mapAppointment(a: AppointmentWithRelations): AppointmentDto {
  return {
    id: a.id,
    patientId: a.patientId,
    patientName: a.patient
      ? `${a.patient.firstName} ${a.patient.lastName}`
      : '',
    serviceId: a.serviceId ?? undefined,
    serviceName: a.service?.name ?? undefined,
    visitType: a.visitType,
    chiefComplaint: a.chiefComplaint ?? undefined,
    treatmentArea: a.treatmentArea ?? undefined,
    sessionNumber: a.sessionNumber ?? undefined,
    totalSessions: a.totalSessions ?? undefined,
    consentStatus: a.consentStatus ?? undefined,
    patchTestStatus: a.patchTestStatus ?? undefined,
    room: a.room ?? undefined,
    bookingSource: a.bookingSource ?? undefined,
    reminderChannel: a.reminderChannel ?? undefined,
    depositExpected: a.depositExpected ?? undefined,
    treatmentId: a.treatmentId ?? undefined,
    invoiceId: a.invoiceId ?? undefined,
    decision: a.decision,
    followUpDate: a.followUpDate ?? undefined,
    startTime: a.startTime.toISOString(),
    endTime: a.endTime.toISOString(),
    status: a.status,
    notes: a.notes ?? undefined,
    createdAt: a.createdAt?.toISOString(),
  };
}

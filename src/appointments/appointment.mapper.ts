import { Appointment, ClinicService, Patient, User } from '@prisma/client';

export type AppointmentWithRelations = Appointment & {
  patient?: Patient | null;
  doctor?: User | null;
  service?: ClinicService | null;
};

export interface AppointmentDto {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  serviceId?: string;
  serviceName?: string;
  startTime: string;
  endTime: string;
  status: string;
  notes?: string;
  createdAt?: string;
}

export const APPOINTMENT_INCLUDE = {
  patient: true,
  doctor: true,
  service: true,
} as const;

export function mapAppointment(a: AppointmentWithRelations): AppointmentDto {
  return {
    id: a.id,
    patientId: a.patientId,
    patientName: a.patient
      ? `${a.patient.firstName} ${a.patient.lastName}`
      : '',
    doctorId: a.doctorId,
    doctorName: a.doctor ? `${a.doctor.firstName} ${a.doctor.lastName}` : '',
    serviceId: a.serviceId ?? undefined,
    serviceName: a.service?.name ?? undefined,
    startTime: a.startTime.toISOString(),
    endTime: a.endTime.toISOString(),
    status: a.status,
    notes: a.notes ?? undefined,
    createdAt: a.createdAt?.toISOString(),
  };
}

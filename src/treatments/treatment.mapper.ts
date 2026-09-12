import { ClinicService, Patient, Treatment, User } from '@prisma/client';

export type TreatmentWithRelations = Treatment & {
  patient?: Patient | null;
  doctor?: User | null;
  service?: ClinicService | null;
};

export interface TreatmentDto {
  id: string;
  patientId: string;
  patientName: string;
  serviceId: string;
  serviceName: string;
  doctorId: string;
  doctorName: string;
  therapistName?: string;
  appointmentId?: string;
  date: string;
  status: string;
  sessionNumber?: number;
  totalSessions?: number;
  treatmentArea?: string;
  parameters?: string;
  consumablesUsed?: string;
  adverseReaction?: string;
  aftercare?: string;
  nextSessionDate?: string;
  diagnosis?: string;
  trichoscopyNotes?: string;
  price: number;
  isComplementary: boolean;
  beforeImageKey?: string;
  beforeImageUrl?: string;
  afterImageKey?: string;
  afterImageUrl?: string;
  notes?: string;
}

export const TREATMENT_INCLUDE = {
  patient: true,
  doctor: true,
  service: true,
} as const;

export function mapTreatment(t: TreatmentWithRelations): TreatmentDto {
  return {
    id: t.id,
    patientId: t.patientId,
    patientName: t.patient
      ? `${t.patient.firstName} ${t.patient.lastName}`
      : '',
    serviceId: t.serviceId,
    serviceName: t.service?.name ?? '',
    doctorId: t.doctorId,
    doctorName: t.doctor ? `${t.doctor.firstName} ${t.doctor.lastName}` : '',
    therapistName: t.therapistName ?? undefined,
    appointmentId: t.appointmentId ?? undefined,
    date: t.date,
    status: t.status,
    sessionNumber: t.sessionNumber ?? undefined,
    totalSessions: t.totalSessions ?? undefined,
    treatmentArea: t.treatmentArea ?? undefined,
    parameters: t.parameters ?? undefined,
    consumablesUsed: t.consumablesUsed ?? undefined,
    adverseReaction: t.adverseReaction ?? undefined,
    aftercare: t.aftercare ?? undefined,
    nextSessionDate: t.nextSessionDate ?? undefined,
    diagnosis: t.diagnosis ?? undefined,
    trichoscopyNotes: t.trichoscopyNotes ?? undefined,
    price: t.price,
    isComplementary: t.isComplementary,
    beforeImageKey: t.beforeImageKey ?? undefined,
    afterImageKey: t.afterImageKey ?? undefined,
    notes: t.notes ?? undefined,
  };
}

export function parseDataUrl(
  value: string,
): { mime: string; buffer: Buffer } | null {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(value);
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

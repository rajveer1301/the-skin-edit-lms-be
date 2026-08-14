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
  date: string;
  status: string;
  sessionNumber?: number;
  totalSessions?: number;
  price: number;
  isComplementary: boolean;
  beforeImageUrl?: string;
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
    date: t.date,
    status: t.status,
    sessionNumber: t.sessionNumber ?? undefined,
    totalSessions: t.totalSessions ?? undefined,
    price: t.price,
    isComplementary: t.isComplementary,
    beforeImageUrl: toDataUrl(t.beforeImage, t.beforeImageType),
    afterImageUrl: toDataUrl(t.afterImage, t.afterImageType),
    notes: t.notes ?? undefined,
  };
}

/** Builds a `data:` URL from a stored image buffer so it can be used as an <img> src. */
function toDataUrl(
  buffer: Uint8Array | Buffer | null,
  mime: string | null,
): string | undefined {
  if (!buffer) return undefined;
  const b64 = Buffer.from(buffer).toString('base64');
  return `data:${mime ?? 'image/*'};base64,${b64}`;
}

export interface ParsedImage {
  data: Uint8Array<ArrayBuffer>;
  mime: string;
}

/**
 * Parses an incoming image value into a buffer + mime type.
 * Accepts a `data:<mime>;base64,<payload>` URL (as produced by the browser
 * FileReader). Returns `null` to clear the image when the value is empty, and
 * `undefined` to leave it untouched when the value was not provided.
 */
export function parseImageInput(
  value: string | undefined,
): ParsedImage | null | undefined {
  if (value === undefined) return undefined;
  if (value === '') return null;
  const match = /^data:([^;]+);base64,(.*)$/s.exec(value);
  if (!match) return undefined;
  const buffer = Buffer.from(match[2], 'base64');
  // Copy into a Uint8Array backed by a plain ArrayBuffer to satisfy Prisma's Bytes type.
  const data = new Uint8Array(buffer.byteLength);
  data.set(buffer);
  return { data, mime: match[1] };
}

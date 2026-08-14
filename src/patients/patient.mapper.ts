import { Patient } from '@prisma/client';

export interface PatientDto {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth?: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  bloodGroup?: string;
  allergies: string[];
  allergyDetails?: string;
  medicalConditions: string[];
  medications: string[];
  medicalHistory?: string;
  previousProcedures: string[];
  pregnancyStatus?: string;
  referralSource?: string;
  skinConcerns: string[];
  hairConcerns: string[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function mapPatient(p: Patient): PatientDto {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender,
    dateOfBirth: p.dateOfBirth ?? undefined,
    phone: p.phone,
    email: p.email ?? undefined,
    address: p.address ?? undefined,
    city: p.city ?? undefined,
    bloodGroup: p.bloodGroup ?? undefined,
    allergies: p.allergies,
    allergyDetails: p.allergyDetails ?? undefined,
    medicalConditions: p.medicalConditions,
    medications: p.medications,
    medicalHistory: p.medicalHistory ?? undefined,
    previousProcedures: p.previousProcedures,
    pregnancyStatus: p.pregnancyStatus ?? undefined,
    referralSource: p.referralSource ?? undefined,
    skinConcerns: p.skinConcerns,
    hairConcerns: p.hairConcerns,
    notes: p.notes ?? undefined,
    createdAt: p.createdAt?.toISOString(),
    updatedAt: p.updatedAt?.toISOString(),
  };
}

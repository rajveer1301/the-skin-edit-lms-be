import { Lead, User } from '@prisma/client';

export type LeadWithAssignee = Lead & { assignedTo?: User | null };

export interface LeadDto {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  city?: string;
  gender?: string;
  source: string;
  status: string;
  interestCategory?: string;
  interestedIn?: string;
  lostReason?: string;
  convertedPatientId?: string;
  assignedToId?: string;
  assignedToName?: string;
  notes?: string;
  followUpDate?: string;
  createdAt?: string;
}

export const LEAD_INCLUDE = { assignedTo: true } as const;

export function mapLead(l: LeadWithAssignee): LeadDto {
  return {
    id: l.id,
    firstName: l.firstName,
    lastName: l.lastName,
    phone: l.phone,
    whatsapp: l.whatsapp ?? undefined,
    email: l.email ?? undefined,
    city: l.city ?? undefined,
    gender: l.gender ?? undefined,
    source: l.source,
    status: l.status,
    interestCategory: l.interestCategory ?? undefined,
    interestedIn: l.interestedIn ?? undefined,
    lostReason: l.lostReason ?? undefined,
    convertedPatientId: l.convertedPatientId ?? undefined,
    assignedToId: l.assignedToId ?? undefined,
    assignedToName: l.assignedTo
      ? `${l.assignedTo.firstName} ${l.assignedTo.lastName}`
      : undefined,
    notes: l.notes ?? undefined,
    followUpDate: l.followUpDate ?? undefined,
    createdAt: l.createdAt?.toISOString(),
  };
}

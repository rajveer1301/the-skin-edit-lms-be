import { Lead, User } from '@prisma/client';

export type LeadWithAssignee = Lead & { assignedTo?: User | null };

export interface LeadDto {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  source: string;
  status: string;
  interestedIn?: string;
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
    email: l.email ?? undefined,
    source: l.source,
    status: l.status,
    interestedIn: l.interestedIn ?? undefined,
    assignedToId: l.assignedToId ?? undefined,
    assignedToName: l.assignedTo
      ? `${l.assignedTo.firstName} ${l.assignedTo.lastName}`
      : undefined,
    notes: l.notes ?? undefined,
    followUpDate: l.followUpDate ?? undefined,
    createdAt: l.createdAt?.toISOString(),
  };
}

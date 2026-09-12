import { User } from '@prisma/client';

export interface UserDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: string;
  active: boolean;
  specialization?: string;
  registrationNumber?: string;
  calendarColor?: string;
  workingHours?: string;
  commissionPercent?: number;
  avatarUrl?: string;
  createdAt?: string;
}

export function mapUser(user: User): UserDto {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? undefined,
    role: user.role,
    active: user.active,
    specialization: user.specialization ?? undefined,
    registrationNumber: user.registrationNumber ?? undefined,
    calendarColor: user.calendarColor ?? undefined,
    workingHours: user.workingHours ?? undefined,
    commissionPercent: user.commissionPercent ?? undefined,
    avatarUrl: user.avatarUrl ?? undefined,
    createdAt: user.createdAt?.toISOString(),
  };
}

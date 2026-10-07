import {
  ClinicService,
  Patient,
  Prisma,
  Treatment,
  TreatmentPlan,
  TreatmentPlanItem,
} from '@prisma/client';

export type PlanWithRelations = TreatmentPlan & {
  patient?: Pick<Patient, 'firstName' | 'lastName'> | null;
  items?: Array<
    TreatmentPlanItem & {
      service?: Pick<ClinicService, 'name'> | null;
      sessions?: Treatment[];
    }
  >;
};

export interface SittingDto {
  id: string;
  date: string;
  sessionNumber?: number;
  totalSessions?: number;
  status: string;
  readings?: Prisma.JsonValue;
}

export interface TreatmentPlanItemDto {
  id: string;
  serviceId: string;
  serviceName: string;
  kind: string;
  sessionCount: number;
  intervalDays?: number;
  price: number;
  startDate?: string;
  parameterTemplate?: Prisma.JsonValue;
  sittings: SittingDto[];
}

export interface TreatmentPlanDto {
  id: string;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  status: string;
  followUpDate?: string;
  declinedReason?: string;
  notes?: string;
  items: TreatmentPlanItemDto[];
  createdAt: string;
  updatedAt: string;
}

export const PLAN_INCLUDE = {
  patient: { select: { firstName: true, lastName: true } },
  items: {
    include: {
      service: { select: { name: true } },
      sessions: { orderBy: { sessionNumber: 'asc' as const } },
    },
  },
} as const;

export function mapPlan(plan: PlanWithRelations): TreatmentPlanDto {
  return {
    id: plan.id,
    patientId: plan.patientId,
    patientName: plan.patient
      ? `${plan.patient.firstName} ${plan.patient.lastName}`
      : '',
    appointmentId: plan.appointmentId ?? undefined,
    status: plan.status,
    followUpDate: plan.followUpDate ?? undefined,
    declinedReason: plan.declinedReason ?? undefined,
    notes: plan.notes ?? undefined,
    items: (plan.items ?? []).map((item) => ({
      id: item.id,
      serviceId: item.serviceId,
      serviceName: item.service?.name ?? '',
      kind: item.kind,
      sessionCount: item.sessionCount,
      intervalDays: item.intervalDays ?? undefined,
      price: item.price,
      startDate: item.startDate ?? undefined,
      parameterTemplate: item.parameterTemplate ?? undefined,
      sittings: (item.sessions ?? []).map((session) => ({
        id: session.id,
        date: session.date,
        sessionNumber: session.sessionNumber ?? undefined,
        totalSessions: session.totalSessions ?? undefined,
        status: session.status,
        readings: session.readings ?? undefined,
      })),
    })),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

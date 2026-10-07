import { serializable } from '../common/utils/transaction';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClinicService,
  ConsultDecision,
  PlanItemKind,
  PlanStatus,
  Prisma,
  TreatmentStatus,
} from '@prisma/client';
import { Paginated } from '../common/interfaces/paginated.interface';
import { getPageParams, paginated } from '../common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { mapAppointment } from '../appointments/appointment.mapper';
import { addDays, diffDays, isIsoDay, todayIso } from './dates';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import { DeclinePlanDto } from './dto/decline-plan.dto';
import { PlanItemInputDto } from './dto/plan-item-input.dto';
import { RescheduleSittingDto } from './dto/reschedule-sitting.dto';
import { TreatmentPlanQueryDto } from './dto/treatment-plan-query.dto';
import { UpdateTreatmentPlanDto } from './dto/update-treatment-plan.dto';
import {
  mapPlan,
  PLAN_INCLUDE,
  TreatmentPlanDto,
} from './treatment-plan.mapper';

const OPEN_DECISIONS: ConsultDecision[] = [
  ConsultDecision.AWAITING_DECISION,
  ConsultDecision.REPORTS_PENDING,
];

@Injectable()
export class TreatmentPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: TreatmentPlanQueryDto,
  ): Promise<Paginated<TreatmentPlanDto>> {
    const params = getPageParams(query);
    const where: Prisma.TreatmentPlanWhereInput = {};
    if (query.patientId) where.patientId = query.patientId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        {
          patient: {
            firstName: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          patient: {
            lastName: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          items: {
            some: {
              service: {
                name: { contains: query.search, mode: 'insensitive' },
              },
            },
          },
        },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.treatmentPlan.findMany({
        where,
        include: PLAN_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.treatmentPlan.count({ where }),
    ]);
    return paginated(rows.map(mapPlan), total, params);
  }

  async findOne(id: string): Promise<TreatmentPlanDto> {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      include: PLAN_INCLUDE,
    });
    if (!plan) {
      throw new NotFoundException('Treatment plan not found');
    }
    return mapPlan(plan);
  }

  async followUps() {
    const today = todayIso();
    const [plans, consultations] = await Promise.all([
      this.prisma.treatmentPlan.findMany({
        where: {
          status: PlanStatus.PROPOSED,
          followUpDate: { not: null, lte: today },
        },
        include: PLAN_INCLUDE,
        orderBy: { followUpDate: 'asc' },
      }),
      this.prisma.appointment.findMany({
        where: {
          decision: { in: OPEN_DECISIONS },
          followUpDate: { not: null, lte: today },
        },
        include: { patient: true, service: true },
        orderBy: { followUpDate: 'asc' },
      }),
    ]);
    return {
      plans: plans.map(mapPlan),
      consultations: consultations.map(mapAppointment),
    };
  }

  async create(dto: CreateTreatmentPlanDto): Promise<TreatmentPlanDto> {
    await this.ensurePatient(dto.patientId);
    await this.ensureAppointment(dto.appointmentId, dto.patientId);
    const items = await this.resolveItems(dto.items);
    const plan = await this.prisma.treatmentPlan.create({
      data: {
        patientId: dto.patientId,
        appointmentId: dto.appointmentId,
        followUpDate: dto.followUpDate,
        notes: dto.notes,
        status: PlanStatus.PROPOSED,
        items: { create: items },
      },
      include: PLAN_INCLUDE,
    });
    return mapPlan(plan);
  }

  async update(
    id: string,
    dto: UpdateTreatmentPlanDto,
  ): Promise<TreatmentPlanDto> {
    return serializable(this.prisma, async (tx) => {
      const existing = await tx.treatmentPlan.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException('Treatment plan not found');
      }
      if (dto.items && existing.status !== PlanStatus.PROPOSED) {
        throw new BadRequestException(
          'Plan items can only change while the plan is proposed',
        );
      }
      if (
        dto.status &&
        dto.status !== existing.status &&
        !this.canSetStatus(existing.status, dto.status)
      ) {
        throw new BadRequestException(
          `Cannot move a plan from ${existing.status} to ${dto.status}`,
        );
      }
      const patientId = dto.patientId ?? existing.patientId;
      if (dto.patientId && dto.patientId !== existing.patientId) {
        throw new BadRequestException(
          'Treatment plans cannot be reassigned to another patient',
        );
      }
      if (dto.appointmentId) {
        await this.ensureAppointment(dto.appointmentId, patientId, tx);
      }
      if (
        dto.status === PlanStatus.COMPLETED &&
        (await tx.treatment.count({
          where: {
            planItem: { planId: id },
            status: { not: TreatmentStatus.COMPLETED },
          },
        }))
      )
        throw new BadRequestException(
          'Complete all sittings before completing the plan',
        );
      const items = dto.items
        ? await this.resolveItems(dto.items, tx)
        : undefined;

      if (items) {
        if (await tx.invoiceItem.count({ where: { planItem: { planId: id } } }))
          throw new BadRequestException('Billed plan items cannot be replaced');
        await tx.treatmentPlanItem.deleteMany({ where: { planId: id } });
      }
      await tx.treatmentPlan.update({
        where: { id },
        data: {
          patientId: dto.patientId,
          appointmentId: dto.appointmentId,
          followUpDate: dto.followUpDate,
          notes: dto.notes,
          declinedReason: dto.declinedReason,
          status: dto.status,
          items: items ? { create: items } : undefined,
        },
      });
      return mapPlan(
        await tx.treatmentPlan.findUniqueOrThrow({
          where: { id },
          include: PLAN_INCLUDE,
        }),
      );
    });
  }

  async accept(id: string): Promise<TreatmentPlanDto> {
    return serializable(this.prisma, async (tx) => {
      const plan = await tx.treatmentPlan.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!plan) {
        throw new NotFoundException('Treatment plan not found');
      }
      if (
        plan.status === PlanStatus.ACCEPTED ||
        plan.status === PlanStatus.IN_PROGRESS ||
        plan.status === PlanStatus.COMPLETED
      )
        return mapPlan(
          await tx.treatmentPlan.findUniqueOrThrow({
            where: { id },
            include: PLAN_INCLUDE,
          }),
        );
      if (plan.status !== PlanStatus.PROPOSED) {
        throw new BadRequestException('Only a proposed plan can be accepted');
      }
      if (!plan.items.length) {
        throw new BadRequestException(
          'Add at least one service before accepting',
        );
      }
      for (const item of plan.items) {
        if (!item.startDate) {
          throw new BadRequestException(
            'Every plan item needs a start date before sittings can be generated',
          );
        }
      }

      const existingSittings = await tx.treatment.count({
        where: { planItem: { planId: id } },
      });
      if (existingSittings > 0) {
        throw new BadRequestException('Sittings already exist for this plan');
      }
      const sessions: Prisma.TreatmentCreateManyInput[] = [];
      for (const item of plan.items) {
        if (
          item.sessionCount > 200 ||
          sessions.length + item.sessionCount > 1000
        )
          throw new BadRequestException('Too many sittings in one plan');
        for (let index = 0; index < item.sessionCount; index++) {
          sessions.push({
            patientId: plan.patientId,
            serviceId: item.serviceId,
            planItemId: item.id,
            date: addDays(item.startDate!, index * (item.intervalDays ?? 0)),
            status: TreatmentStatus.PLANNED,
            sessionNumber: index + 1,
            totalSessions: item.sessionCount,
            price: 0,
            isComplementary: item.kind === PlanItemKind.COMPLEMENTARY,
          });
        }
      }
      await tx.treatment.createMany({ data: sessions });
      await tx.treatmentPlan.update({
        where: { id },
        data: { status: PlanStatus.ACCEPTED },
      });
      return mapPlan(
        await tx.treatmentPlan.findUniqueOrThrow({
          where: { id },
          include: PLAN_INCLUDE,
        }),
      );
    });
  }

  async decline(id: string, dto: DeclinePlanDto): Promise<TreatmentPlanDto> {
    return serializable(this.prisma, async (tx) => {
      const plan = await tx.treatmentPlan.findUnique({ where: { id } });
      if (!plan) {
        throw new NotFoundException('Treatment plan not found');
      }
      if (plan.status !== PlanStatus.PROPOSED) {
        throw new BadRequestException('This plan can no longer be declined');
      }
      await tx.treatmentPlan.update({
        where: { id },
        data: {
          status: PlanStatus.DECLINED,
          declinedReason: dto.reason,
        },
      });
      return mapPlan(
        await tx.treatmentPlan.findUniqueOrThrow({
          where: { id },
          include: PLAN_INCLUDE,
        }),
      );
    });
  }

  async reschedule(
    planId: string,
    sittingId: string,
    dto: RescheduleSittingDto,
  ): Promise<TreatmentPlanDto> {
    return serializable(this.prisma, async (tx) => {
      const sitting = await tx.treatment.findFirst({
        where: { id: sittingId, planItem: { planId } },
      });
      if (!sitting?.planItemId) {
        throw new NotFoundException('Sitting not found on this plan');
      }
      if (sitting.status === TreatmentStatus.COMPLETED)
        throw new BadRequestException(
          'Completed sittings cannot be rescheduled',
        );
      const plan = await tx.treatmentPlan.findUniqueOrThrow({
        where: { id: planId },
      });
      if (
        plan.status === PlanStatus.COMPLETED ||
        plan.status === PlanStatus.DECLINED
      )
        throw new BadRequestException('This plan cannot be rescheduled');
      const nextDate = dto.date;
      if (!isIsoDay(nextDate)) {
        throw new BadRequestException('Sitting date must be YYYY-MM-DD');
      }
      const delta = diffDays(sitting.date, nextDate);

      await tx.treatment.update({
        where: { id: sitting.id },
        data: { date: nextDate },
      });
      if (dto.shiftFollowing && delta !== 0) {
        const following = await tx.treatment.findMany({
          where: {
            planItemId: sitting.planItemId,
            sessionNumber: { gt: sitting.sessionNumber ?? 0 },
            status: { not: TreatmentStatus.COMPLETED },
          },
        });
        for (const row of following) {
          await tx.treatment.update({
            where: { id: row.id },
            data: { date: addDays(row.date, delta) },
          });
        }
      }
      return mapPlan(
        await tx.treatmentPlan.findUniqueOrThrow({
          where: { id: planId },
          include: PLAN_INCLUDE,
        }),
      );
    });
  }

  private canSetStatus(from: PlanStatus, to: PlanStatus): boolean {
    if (from === to) return true;
    if (to === PlanStatus.IN_PROGRESS) {
      return from === PlanStatus.ACCEPTED || from === PlanStatus.IN_PROGRESS;
    }
    if (to === PlanStatus.COMPLETED) {
      return from === PlanStatus.ACCEPTED || from === PlanStatus.IN_PROGRESS;
    }
    return false;
  }

  private async resolveItems(
    inputs: PlanItemInputDto[],
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const services = await db.clinicService.findMany({
      where: { id: { in: inputs.map((item) => item.serviceId) } },
    });
    const byId = new Map(services.map((service) => [service.id, service]));
    return inputs.map((input) => this.toItemData(input, byId));
  }

  private toItemData(
    input: PlanItemInputDto,
    services: Map<string, ClinicService>,
  ): Prisma.TreatmentPlanItemCreateWithoutPlanInput {
    const service = services.get(input.serviceId);
    if (!service || !service.active) {
      throw new BadRequestException(`Unknown service ${input.serviceId}`);
    }
    if (input.kind === PlanItemKind.COMPLEMENTARY && input.price !== 0) {
      throw new BadRequestException(
        'A complimentary service must have a price of 0',
      );
    }
    if (input.startDate && !isIsoDay(input.startDate)) {
      throw new BadRequestException('Start date must be YYYY-MM-DD');
    }
    const sessionCount = this.sessionCount(input, service);
    if (input.kind !== PlanItemKind.PACKAGE && sessionCount !== 1) {
      throw new BadRequestException(
        'Single and complimentary services have one sitting',
      );
    }
    return {
      service: { connect: { id: service.id } },
      kind: input.kind,
      sessionCount,
      intervalDays:
        input.intervalDays ?? service.defaultIntervalDays ?? undefined,
      price: input.kind === PlanItemKind.COMPLEMENTARY ? 0 : input.price,
      startDate: input.startDate?.slice(0, 10),
      parameterTemplate:
        service.parameterTemplate === null
          ? undefined
          : service.parameterTemplate,
    };
  }

  private sessionCount(
    input: PlanItemInputDto,
    service: ClinicService,
  ): number {
    if (input.sessionCount) return input.sessionCount;
    if (input.kind === PlanItemKind.PACKAGE) {
      return service.defaultSessionCount ?? 1;
    }
    return 1;
  }

  private async ensurePatient(
    id: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const count = await db.patient.count({ where: { id } });
    if (!count) {
      throw new NotFoundException('Patient not found');
    }
  }

  private async ensureAppointment(
    appointmentId: string | undefined,
    patientId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    if (!appointmentId) return;
    const appointment = await db.appointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appointment || appointment.patientId !== patientId) {
      throw new BadRequestException(
        'Consultation does not belong to this patient',
      );
    }
  }
}

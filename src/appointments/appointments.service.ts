import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { Paginated } from '../common/interfaces/paginated.interface';
import { getPageParams, paginated } from '../common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import {
  APPOINTMENT_INCLUDE,
  AppointmentDto,
  mapAppointment,
} from './appointment.mapper';
import { AppointmentQueryDto } from './dto/appointment-query.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: AppointmentQueryDto,
  ): Promise<Paginated<AppointmentDto>> {
    const params = getPageParams(query);
    const where: Prisma.AppointmentWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.patientId) where.patientId = query.patientId;
    if (query.from || query.to) {
      where.startTime = {};
      if (query.from) where.startTime.gte = new Date(query.from);
      if (query.to) where.startTime.lte = new Date(query.to);
    }
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
        { service: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: APPOINTMENT_INCLUDE,
        orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return paginated(rows.map(mapAppointment), total, params);
  }

  async findOne(id: string): Promise<AppointmentDto> {
    const appt = await this.prisma.appointment.findUnique({
      where: { id },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appt) {
      throw new NotFoundException('Appointment not found');
    }
    return mapAppointment(appt);
  }

  async create(dto: CreateAppointmentDto): Promise<AppointmentDto> {
    await this.validate(dto);
    const appt = await this.prisma.appointment.create({
      data: {
        patientId: dto.patientId,
        serviceId: dto.serviceId,
        visitType: dto.visitType,
        chiefComplaint: dto.chiefComplaint,
        treatmentArea: dto.treatmentArea,
        sessionNumber: dto.sessionNumber,
        totalSessions: dto.totalSessions,
        consentStatus: dto.consentStatus,
        patchTestStatus: dto.patchTestStatus,
        room: dto.room,
        bookingSource: dto.bookingSource,
        reminderChannel: dto.reminderChannel,
        depositExpected: dto.depositExpected,
        decision: dto.decision,
        followUpDate: dto.followUpDate,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        status: dto.status,
        notes: dto.notes,
      },
      include: APPOINTMENT_INCLUDE,
    });
    return mapAppointment(appt);
  }

  async update(id: string, dto: UpdateAppointmentDto): Promise<AppointmentDto> {
    const existing = await this.prisma.appointment.findUniqueOrThrow({
      where: { id },
    });
    await this.validate(dto, existing);
    const appt = await this.prisma.appointment.update({
      where: { id },
      data: {
        patientId: dto.patientId,
        serviceId: dto.serviceId,
        visitType: dto.visitType,
        chiefComplaint: dto.chiefComplaint,
        treatmentArea: dto.treatmentArea,
        sessionNumber: dto.sessionNumber,
        totalSessions: dto.totalSessions,
        consentStatus: dto.consentStatus,
        patchTestStatus: dto.patchTestStatus,
        room: dto.room,
        bookingSource: dto.bookingSource,
        reminderChannel: dto.reminderChannel,
        depositExpected: dto.depositExpected,
        decision: dto.decision,
        followUpDate: dto.followUpDate,
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        endTime: dto.endTime ? new Date(dto.endTime) : undefined,
        status: dto.status,
        notes: dto.notes,
      },
      include: APPOINTMENT_INCLUDE,
    });
    return mapAppointment(appt);
  }

  async updateStatus(
    id: string,
    status: AppointmentStatus,
  ): Promise<AppointmentDto> {
    const appt = await this.prisma.appointment.update({
      where: { id },
      data: { status },
      include: APPOINTMENT_INCLUDE,
    });
    return mapAppointment(appt);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    await this.prisma.appointment.delete({ where: { id } });
    return { success: true };
  }

  private async validate(
    dto: Partial<CreateAppointmentDto>,
    existing?: {
      patientId: string;
      startTime: Date;
      endTime: Date;
      serviceId: string | null;
    },
  ) {
    const start = dto.startTime ? new Date(dto.startTime) : existing?.startTime;
    const end = dto.endTime ? new Date(dto.endTime) : existing?.endTime;
    if (!start || !end || !(end > start))
      throw new BadRequestException('Appointment end must be after its start');
    if (existing && dto.patientId && dto.patientId !== existing.patientId)
      throw new BadRequestException(
        'Appointments cannot be reassigned to another patient',
      );
    if (
      dto.serviceId &&
      dto.serviceId !== existing?.serviceId &&
      !(await this.prisma.clinicService.count({
        where: { id: dto.serviceId, active: true },
      }))
    )
      throw new BadRequestException('Choose an active service');
  }

  private async ensureExists(id: string): Promise<void> {
    const count = await this.prisma.appointment.count({ where: { id } });
    if (!count) {
      throw new NotFoundException('Appointment not found');
    }
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
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
    if (query.doctorId) where.doctorId = query.doctorId;
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
        {
          doctor: {
            firstName: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          doctor: { lastName: { contains: query.search, mode: 'insensitive' } },
        },
        { service: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: APPOINTMENT_INCLUDE,
        orderBy: { startTime: 'desc' },
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
    const appt = await this.prisma.appointment.create({
      data: {
        patientId: dto.patientId,
        doctorId: dto.doctorId,
        serviceId: dto.serviceId,
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
    await this.ensureExists(id);
    const appt = await this.prisma.appointment.update({
      where: { id },
      data: {
        patientId: dto.patientId,
        doctorId: dto.doctorId,
        serviceId: dto.serviceId,
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
    await this.ensureExists(id);
    const appt = await this.prisma.appointment.update({
      where: { id },
      data: { status },
      include: APPOINTMENT_INCLUDE,
    });
    return mapAppointment(appt);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    await this.ensureExists(id);
    await this.prisma.appointment.delete({ where: { id } });
    return { success: true };
  }

  private async ensureExists(id: string): Promise<void> {
    const count = await this.prisma.appointment.count({ where: { id } });
    if (!count) {
      throw new NotFoundException('Appointment not found');
    }
  }
}

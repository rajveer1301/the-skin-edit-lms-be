import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  APPOINTMENT_INCLUDE,
  mapAppointment,
} from '../appointments/appointment.mapper';
import { INVOICE_INCLUDE, mapInvoice } from '../billing/invoice.mapper';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { Paginated } from '../common/interfaces/paginated.interface';
import {
  buildOrderBy,
  getPageParams,
  paginated,
} from '../common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import {
  mapTreatment,
  TREATMENT_INCLUDE,
} from '../treatments/treatment.mapper';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { mapPatient, PatientDto } from './patient.mapper';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListQueryDto): Promise<Paginated<PatientDto>> {
    const params = getPageParams(query);
    const where: Prisma.PatientWhereInput = query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' } },
            { lastName: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const orderBy = buildOrderBy(query, [
      'firstName',
      'lastName',
      'city',
      'createdAt',
    ]);
    const [rows, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        orderBy,
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.patient.count({ where }),
    ]);
    return paginated(rows.map(mapPatient), total, params);
  }

  async findOne(id: string): Promise<PatientDto> {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    return mapPatient(patient);
  }

  async create(dto: CreatePatientDto): Promise<PatientDto> {
    const patient = await this.prisma.patient.create({
      data: {
        ...dto,
        allergies: dto.allergies ?? [],
        medicalConditions: dto.medicalConditions ?? [],
        medications: dto.medications ?? [],
        previousProcedures: dto.previousProcedures ?? [],
        skinConcerns: dto.skinConcerns ?? [],
        hairConcerns: dto.hairConcerns ?? [],
      },
    });
    return mapPatient(patient);
  }

  async update(id: string, dto: UpdatePatientDto): Promise<PatientDto> {
    await this.ensureExists(id);
    const patient = await this.prisma.patient.update({
      where: { id },
      data: dto,
    });
    return mapPatient(patient);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    await this.ensureExists(id);
    await this.prisma.patient.delete({ where: { id } });
    return { success: true };
  }

  async appointments(id: string, query: ListQueryDto) {
    await this.ensureExists(id);
    const params = getPageParams(query);
    const [rows, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { patientId: id },
        include: APPOINTMENT_INCLUDE,
        orderBy: { startTime: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.appointment.count({ where: { patientId: id } }),
    ]);
    return paginated(rows.map(mapAppointment), total, params);
  }

  async treatments(id: string, query: ListQueryDto) {
    await this.ensureExists(id);
    const params = getPageParams(query);
    const [rows, total] = await Promise.all([
      this.prisma.treatment.findMany({
        where: { patientId: id },
        include: TREATMENT_INCLUDE,
        orderBy: { date: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.treatment.count({ where: { patientId: id } }),
    ]);
    return paginated(rows.map(mapTreatment), total, params);
  }

  async invoices(id: string, query: ListQueryDto) {
    await this.ensureExists(id);
    const params = getPageParams(query);
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { patientId: id },
        include: INVOICE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.invoice.count({ where: { patientId: id } }),
    ]);
    return paginated(rows.map(mapInvoice), total, params);
  }

  async documents(id: string, query: ListQueryDto) {
    await this.ensureExists(id);
    const params = getPageParams(query);
    return paginated([], 0, params);
  }

  private async ensureExists(id: string): Promise<void> {
    const count = await this.prisma.patient.count({ where: { id } });
    if (!count) {
      throw new NotFoundException('Patient not found');
    }
  }
}

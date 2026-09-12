import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { StorageService } from '../storage/storage.service';
import {
  mapTreatment,
  TREATMENT_INCLUDE,
} from '../treatments/treatment.mapper';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { mapPatient, PatientDto } from './patient.mapper';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

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
        visitReasons: dto.visitReasons ?? [],
        skinHairProfile: dto.skinHairProfile ?? [],
        allergyCategories: dto.allergyCategories ?? [],
        skinConcerns: dto.skinConcerns ?? [],
        hairConcerns: dto.hairConcerns ?? [],
        wellnessConcerns: dto.wellnessConcerns ?? [],
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
    const [docs, treatments] = await Promise.all([
      this.prisma.patientDocument.findMany({ where: { patientId: id } }),
      this.prisma.treatment.findMany({
        where: { patientId: id },
        select: { beforeImageKey: true, afterImageKey: true },
      }),
    ]);
    await Promise.all([
      ...docs.map((doc) => this.storage.remove(doc.storageKey)),
      ...treatments.flatMap((row) => [
        this.storage.remove(row.beforeImageKey),
        this.storage.remove(row.afterImageKey),
      ]),
    ]);
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
    return paginated(
      await Promise.all(
        rows.map(async (row) => {
          const dto = mapTreatment(row);
          dto.beforeImageUrl = row.beforeImageKey
            ? await this.storage.signUrl(row.beforeImageKey)
            : undefined;
          dto.afterImageUrl = row.afterImageKey
            ? await this.storage.signUrl(row.afterImageKey)
            : undefined;
          return dto;
        }),
      ),
      total,
      params,
    );
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
    const [rows, total] = await Promise.all([
      this.prisma.patientDocument.findMany({
        where: { patientId: id },
        orderBy: { uploadedAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.patientDocument.count({ where: { patientId: id } }),
    ]);
    const data = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        patientId: row.patientId,
        name: row.name,
        type: row.type,
        url: await this.storage.signUrl(row.storageKey),
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
        uploadedAt: row.uploadedAt.toISOString(),
      })),
    );
    return paginated(data, total, params);
  }

  async uploadDocument(
    id: string,
    file: Express.Multer.File | undefined,
    meta: { name?: string; type?: string },
  ) {
    await this.ensureExists(id);
    if (!file?.buffer?.length) {
      throw new BadRequestException('A file is required');
    }
    const type = file.mimetype || 'application/octet-stream';
    if (!type.startsWith('image/') && type !== 'application/pdf') {
      throw new BadRequestException('Only images and PDFs can be uploaded');
    }
    const stored = await this.storage.upload({
      buffer: file.buffer,
      contentType: type,
      folder: `patients/${id}/documents`,
      filename: file.originalname || 'document',
    });
    const row = await this.prisma.patientDocument.create({
      data: {
        patientId: id,
        name: meta.name?.trim() || file.originalname || 'Document',
        type: meta.type?.trim() || 'Other',
        storageKey: stored.key,
        contentType: stored.contentType,
        sizeBytes: stored.size,
      },
    });
    return {
      id: row.id,
      patientId: row.patientId,
      name: row.name,
      type: row.type,
      url: await this.storage.signUrl(row.storageKey),
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      uploadedAt: row.uploadedAt.toISOString(),
    };
  }

  async removeDocument(patientId: string, docId: string) {
    const row = await this.prisma.patientDocument.findFirst({
      where: { id: docId, patientId },
    });
    if (!row) {
      throw new NotFoundException('Document not found');
    }
    await this.storage.remove(row.storageKey);
    await this.prisma.patientDocument.delete({ where: { id: docId } });
    return { success: true };
  }

  private async ensureExists(id: string): Promise<void> {
    const count = await this.prisma.patient.count({ where: { id } });
    if (!count) {
      throw new NotFoundException('Patient not found');
    }
  }
}

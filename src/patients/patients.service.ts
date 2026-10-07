import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { serializable } from '../common/utils/transaction';
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
    const patient = await this.prisma.patient.update({
      where: { id },
      data: dto,
    });
    return mapPatient(patient);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    await serializable(this.prisma, async (tx) => {
      const [docs, treatments] = await Promise.all([
        tx.patientDocument.findMany({
          where: { patientId: id },
          select: { storageKey: true },
        }),
        tx.treatment.findMany({
          where: { patientId: id },
          select: { beforeImageKey: true, afterImageKey: true },
        }),
      ]);
      const keys = [
        ...docs.map((d) => d.storageKey),
        ...treatments.flatMap((t) => [t.beforeImageKey, t.afterImageKey]),
      ].filter((key): key is string => !!key);
      await tx.patient.delete({ where: { id } });
      if (keys.length)
        await tx.fileCleanup.createMany({
          data: keys.map((key) => ({ key })),
          skipDuplicates: true,
        });
    });
    return { success: true };
  }

  async appointments(id: string, query: ListQueryDto) {
    await this.ensureExists(id);
    const params = getPageParams(query);
    const [rows, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { patientId: id },
        include: APPOINTMENT_INCLUDE,
        orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
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
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
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
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
        orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.patientDocument.count({ where: { patientId: id } }),
    ]);
    const data = await Promise.all(
      rows.map((row) => this.presentDocument(row)),
    );
    return paginated(data, total, params);
  }

  async uploadDocument(
    id: string,
    file: Express.Multer.File | undefined,
    meta: {
      name?: string;
      type?: string;
      planId?: string;
      appointmentId?: string;
    },
  ) {
    await this.ensureExists(id);
    if (!file?.buffer?.length) {
      throw new BadRequestException('A file is required');
    }
    const type = file.mimetype || 'application/octet-stream';
    if (!type.startsWith('image/') && type !== 'application/pdf') {
      throw new BadRequestException('Only images and PDFs can be uploaded');
    }
    const documentType = this.normalizeDocumentType(meta.type);
    const planId = meta.planId?.trim() || undefined;
    const appointmentId = meta.appointmentId?.trim() || undefined;
    if (documentType === 'REGISTRATION' && planId) {
      throw new BadRequestException(
        'Registration forms stay on the patient, not a treatment plan',
      );
    }
    if (documentType === 'CONSENT' && !planId) {
      throw new BadRequestException(
        'Consent forms must be linked to a treatment plan',
      );
    }
    if (planId) {
      const plan = await this.prisma.treatmentPlan.findUnique({
        where: { id: planId },
      });
      if (!plan || plan.patientId !== id) {
        throw new BadRequestException(
          'Treatment plan does not belong to this patient',
        );
      }
    }
    if (appointmentId) {
      const appointment = await this.prisma.appointment.findUnique({
        where: { id: appointmentId },
      });
      if (!appointment || appointment.patientId !== id) {
        throw new BadRequestException(
          'Appointment does not belong to this patient',
        );
      }
    }
    const stored = await this.storage.upload({
      buffer: file.buffer,
      contentType: type,
      folder: `patients/${id}/documents`,
      filename: file.originalname || 'document',
    });
    try {
      const row = await this.prisma.patientDocument.create({
        data: {
          patientId: id,
          name: meta.name?.trim() || file.originalname || 'Document',
          type: documentType,
          planId,
          appointmentId,
          storageKey: stored.key,
          contentType: stored.contentType,
          sizeBytes: stored.size,
        },
      });
      return this.presentDocument(row);
    } catch (error) {
      await this.storage.remove(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async removeDocument(patientId: string, docId: string) {
    const row = await this.prisma.patientDocument.findFirst({
      where: { id: docId, patientId },
    });
    if (!row) {
      throw new NotFoundException('Document not found');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.patientDocument.delete({ where: { id: docId } });
      await tx.fileCleanup.upsert({
        where: { key: row.storageKey },
        create: { key: row.storageKey },
        update: {},
      });
    });
    return { success: true };
  }

  private normalizeDocumentType(raw?: string): string {
    const value = (raw?.trim() || 'OTHER').toUpperCase();
    const allowed = ['REGISTRATION', 'CONSENT', 'REPORT', 'OTHER'];
    if (!allowed.includes(value)) {
      throw new BadRequestException(
        'Document type must be REGISTRATION, CONSENT, REPORT, or OTHER',
      );
    }
    return value;
  }

  private async presentDocument(row: {
    id: string;
    patientId: string;
    name: string;
    type: string;
    storageKey: string;
    contentType: string;
    sizeBytes: number;
    uploadedAt: Date;
    planId: string | null;
    appointmentId: string | null;
  }) {
    return {
      id: row.id,
      patientId: row.patientId,
      name: row.name,
      type: row.type,
      planId: row.planId ?? undefined,
      appointmentId: row.appointmentId ?? undefined,
      url: await this.storage.signUrl(row.storageKey),
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      uploadedAt: row.uploadedAt.toISOString(),
    };
  }

  private async ensureExists(id: string): Promise<void> {
    const count = await this.prisma.patient.count({ where: { id } });
    if (!count) {
      throw new NotFoundException('Patient not found');
    }
  }
}

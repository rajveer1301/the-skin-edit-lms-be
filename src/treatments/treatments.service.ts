import { serializable } from '../common/utils/transaction';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Paginated } from '../common/interfaces/paginated.interface';
import { getPageParams, paginated } from '../common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { TreatmentQueryDto } from './dto/treatment-query.dto';
import { UpdateTreatmentDto } from './dto/update-treatment.dto';
import {
  mapTreatment,
  parseDataUrl,
  TREATMENT_INCLUDE,
  TreatmentDto,
} from './treatment.mapper';

@Injectable()
export class TreatmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findAll(query: TreatmentQueryDto): Promise<Paginated<TreatmentDto>> {
    const params = getPageParams(query);
    const where: Prisma.TreatmentWhereInput = {};
    if (query.patientId) where.patientId = query.patientId;
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
      this.prisma.treatment.findMany({
        where,
        include: TREATMENT_INCLUDE,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.treatment.count({ where }),
    ]);
    return paginated(
      await Promise.all(rows.map((row) => this.present(row))),
      total,
      params,
    );
  }

  async findOne(id: string): Promise<TreatmentDto> {
    const treatment = await this.prisma.treatment.findUnique({
      where: { id },
      include: TREATMENT_INCLUDE,
    });
    if (!treatment) {
      throw new NotFoundException('Treatment not found');
    }
    return this.present(treatment);
  }

  async create(dto: CreateTreatmentDto): Promise<TreatmentDto> {
    const data = await this.toData(dto);
    try {
      await this.validateLinks(dto);
      const treatment = await this.prisma.treatment.create({
        data,
        include: TREATMENT_INCLUDE,
      });
      return this.present(treatment);
    } catch (error) {
      await this.cleanFailedUploads(dto, data);
      throw error;
    }
  }

  async update(id: string, dto: UpdateTreatmentDto): Promise<TreatmentDto> {
    const existing = await this.prisma.treatment.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Treatment not found');
    }
    if (dto.patientId && dto.patientId !== existing.patientId)
      throw new BadRequestException(
        'Treatments cannot be reassigned to another patient',
      );
    if (
      existing.planItemId &&
      dto.serviceId &&
      dto.serviceId !== existing.serviceId
    )
      throw new BadRequestException(
        'A plan sitting must retain its planned service',
      );
    if (
      existing.status === 'COMPLETED' &&
      dto.date &&
      dto.date !== existing.date
    )
      throw new BadRequestException('Completed sittings cannot be rescheduled');
    await this.validateLinks(dto, existing);
    const data = await this.toData(dto, existing);
    try {
      const treatment = await serializable(this.prisma, async (tx) => {
        const current = await tx.treatment.findUniqueOrThrow({ where: { id } });
        if (
          (data.beforeImageKey !== undefined &&
            current.beforeImageKey !== existing.beforeImageKey) ||
          (data.afterImageKey !== undefined &&
            current.afterImageKey !== existing.afterImageKey)
        )
          throw new ConflictException(
            'Treatment images changed; reload before editing',
          );
        if (
          current.status === 'COMPLETED' &&
          dto.date &&
          dto.date !== current.date
        )
          throw new BadRequestException(
            'Completed sittings cannot be rescheduled',
          );
        const updated = await tx.treatment.update({
          where: { id },
          data,
          include: TREATMENT_INCLUDE,
        });
        const obsolete = [
          data.beforeImageKey !== undefined &&
          data.beforeImageKey !== existing.beforeImageKey
            ? existing.beforeImageKey
            : null,
          data.afterImageKey !== undefined &&
          data.afterImageKey !== existing.afterImageKey
            ? existing.afterImageKey
            : null,
        ].filter((key): key is string => !!key);
        if (obsolete.length)
          await tx.fileCleanup.createMany({
            data: obsolete.map((key) => ({ key })),
            skipDuplicates: true,
          });
        return updated;
      });
      return this.present(treatment);
    } catch (error) {
      await this.cleanFailedUploads(dto, data);
      throw error;
    }
  }

  async remove(id: string): Promise<{ success: boolean }> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.treatment.delete({ where: { id } });
      const keys = [existing.beforeImageKey, existing.afterImageKey].filter(
        (key): key is string => !!key,
      );
      if (keys.length)
        await tx.fileCleanup.createMany({
          data: keys.map((key) => ({ key })),
          skipDuplicates: true,
        });
    });
    return { success: true };
  }

  private async present(
    row: Parameters<typeof mapTreatment>[0],
  ): Promise<TreatmentDto> {
    const dto = mapTreatment(row);
    dto.beforeImageUrl = row.beforeImageKey
      ? await this.storage.signUrl(row.beforeImageKey)
      : undefined;
    dto.afterImageUrl = row.afterImageKey
      ? await this.storage.signUrl(row.afterImageKey)
      : undefined;
    return dto;
  }

  private async toData(
    dto: CreateTreatmentDto | UpdateTreatmentDto,
    existing?: { beforeImageKey: string | null; afterImageKey: string | null },
  ): Promise<Prisma.TreatmentUncheckedCreateInput> {
    const {
      beforeImageUrl,
      afterImageUrl,
      beforeImageKey,
      afterImageKey,
      ...rest
    } = dto;
    const data = {
      ...rest,
      readings: rest.readings,
    } as Prisma.TreatmentUncheckedCreateInput;

    try {
      const before = await this.resolveImage(
        'treatments/before',
        beforeImageKey,
        beforeImageUrl,
        existing?.beforeImageKey,
      );
      if (before !== undefined) {
        if (existing?.beforeImageKey && existing.beforeImageKey !== before) {
          data.beforeImageDriveId = null;
        }
        data.beforeImageKey = before;
        if (before !== existing?.beforeImageKey) {
          data.beforeImageDriveId = null;
          data.imagesDriveSyncedAt = null;
          data.syncAttempts = 0;
          data.syncAfter = new Date();
        }
        const parsed = beforeImageUrl ? parseDataUrl(beforeImageUrl) : null;
        if (before !== existing?.beforeImageKey)
          data.beforeImageType = parsed?.mime ?? null;
      }

      const after = await this.resolveImage(
        'treatments/after',
        afterImageKey,
        afterImageUrl,
        existing?.afterImageKey,
      );
      if (after !== undefined) {
        if (existing?.afterImageKey && existing.afterImageKey !== after) {
          data.afterImageDriveId = null;
        }
        data.afterImageKey = after;
        if (after !== existing?.afterImageKey) {
          data.afterImageDriveId = null;
          data.imagesDriveSyncedAt = null;
          data.syncAttempts = 0;
          data.syncAfter = new Date();
        }
        const parsed = afterImageUrl ? parseDataUrl(afterImageUrl) : null;
        if (after !== existing?.afterImageKey)
          data.afterImageType = parsed?.mime ?? null;
      }
      return data;
    } catch (error) {
      await this.cleanFailedUploads(dto, data);
      throw error;
    }
  }

  private async cleanFailedUploads(
    dto: Partial<CreateTreatmentDto>,
    data: Prisma.TreatmentUncheckedCreateInput,
  ) {
    const keys = [
      !dto.beforeImageKey && dto.beforeImageUrl?.startsWith('data:')
        ? data.beforeImageKey
        : null,
      !dto.afterImageKey && dto.afterImageUrl?.startsWith('data:')
        ? data.afterImageKey
        : null,
    ];
    await Promise.all(
      keys
        .filter((key): key is string => typeof key === 'string')
        .map((key) => this.storage.remove(key).catch(() => undefined)),
    );
  }

  private async validateLinks(
    dto: Partial<CreateTreatmentDto>,
    existing?: {
      patientId: string;
      serviceId: string;
      appointmentId: string | null;
    },
  ) {
    const patientId = dto.patientId ?? existing?.patientId;
    const appointmentId =
      dto.appointmentId === undefined
        ? existing?.appointmentId
        : dto.appointmentId;
    if (appointmentId) {
      const appt = await this.prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: { patientId: true },
      });
      if (appt?.patientId !== patientId)
        throw new BadRequestException(
          'Appointment does not belong to this patient',
        );
    }
    if (
      dto.serviceId &&
      dto.serviceId !== existing?.serviceId &&
      !(await this.prisma.clinicService.count({
        where: { id: dto.serviceId, active: true },
      }))
    )
      throw new BadRequestException('Choose an active service');
  }

  /** Returns a storage key, null to clear, or undefined to leave unchanged. */
  private async resolveImage(
    folder: string,
    key: string | undefined,
    url: string | undefined,
    current?: string | null,
  ): Promise<string | null | undefined> {
    if (key !== undefined) {
      return key || null;
    }
    if (url === undefined) return undefined;
    if (url === '') return null;
    const parsed = parseDataUrl(url);
    if (parsed) {
      if (
        !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
          parsed.mime,
        ) ||
        !parsed.buffer.length ||
        parsed.buffer.length > 10 * 1024 * 1024
      )
        throw new BadRequestException(
          'Provide a JPEG, PNG, WebP or GIF image up to 10 MB',
        );
      const stored = await this.storage.upload({
        buffer: parsed.buffer,
        contentType: parsed.mime,
        folder,
        filename: `photo.${parsed.mime === 'image/png' ? 'png' : parsed.mime === 'image/webp' ? 'webp' : parsed.mime === 'image/gif' ? 'gif' : 'jpg'}`,
      });
      return stored.key;
    }
    if (current && url.includes(encodeURIComponent(current))) {
      return current;
    }
    return undefined;
  }
}

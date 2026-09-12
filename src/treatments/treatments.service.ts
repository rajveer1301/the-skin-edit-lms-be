import { Injectable, NotFoundException } from '@nestjs/common';
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
      this.prisma.treatment.findMany({
        where,
        include: TREATMENT_INCLUDE,
        orderBy: { date: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.treatment.count({ where }),
    ]);
    return paginated(await Promise.all(rows.map((row) => this.present(row))), total, params);
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
    const treatment = await this.prisma.treatment.create({
      data,
      include: TREATMENT_INCLUDE,
    });
    return this.present(treatment);
  }

  async update(id: string, dto: UpdateTreatmentDto): Promise<TreatmentDto> {
    const existing = await this.prisma.treatment.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Treatment not found');
    }
    const data = await this.toData(dto, existing);
    const treatment = await this.prisma.treatment.update({
      where: { id },
      data,
      include: TREATMENT_INCLUDE,
    });
    return this.present(treatment);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.treatment.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Treatment not found');
    }
    await this.storage.remove(existing.beforeImageKey);
    await this.storage.remove(existing.afterImageKey);
    await this.prisma.treatment.delete({ where: { id } });
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
    const { beforeImageUrl, afterImageUrl, beforeImageKey, afterImageKey, ...rest } =
      dto;
    const data = { ...rest } as Prisma.TreatmentUncheckedCreateInput;

    const before = await this.resolveImage(
      'treatments/before',
      beforeImageKey,
      beforeImageUrl,
      existing?.beforeImageKey,
    );
    if (before !== undefined) {
      if (existing?.beforeImageKey && existing.beforeImageKey !== before) {
        await this.storage.remove(existing.beforeImageKey);
      }
      data.beforeImageKey = before;
    }

    const after = await this.resolveImage(
      'treatments/after',
      afterImageKey,
      afterImageUrl,
      existing?.afterImageKey,
    );
    if (after !== undefined) {
      if (existing?.afterImageKey && existing.afterImageKey !== after) {
        await this.storage.remove(existing.afterImageKey);
      }
      data.afterImageKey = after;
    }
    return data;
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
      const stored = await this.storage.upload({
        buffer: parsed.buffer,
        contentType: parsed.mime,
        folder,
        filename: 'photo.jpg',
      });
      return stored.key;
    }
    if (current && url.includes(encodeURIComponent(current))) {
      return current;
    }
    return undefined;
  }
}

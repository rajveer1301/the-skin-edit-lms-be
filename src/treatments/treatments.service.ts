import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Paginated } from '../common/interfaces/paginated.interface';
import { getPageParams, paginated } from '../common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { TreatmentQueryDto } from './dto/treatment-query.dto';
import { UpdateTreatmentDto } from './dto/update-treatment.dto';
import {
  mapTreatment,
  parseImageInput,
  TREATMENT_INCLUDE,
  TreatmentDto,
} from './treatment.mapper';

@Injectable()
export class TreatmentsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return paginated(rows.map(mapTreatment), total, params);
  }

  async findOne(id: string): Promise<TreatmentDto> {
    const treatment = await this.prisma.treatment.findUnique({
      where: { id },
      include: TREATMENT_INCLUDE,
    });
    if (!treatment) {
      throw new NotFoundException('Treatment not found');
    }
    return mapTreatment(treatment);
  }

  async create(dto: CreateTreatmentDto): Promise<TreatmentDto> {
    const treatment = await this.prisma.treatment.create({
      data: this.toData(dto),
      include: TREATMENT_INCLUDE,
    });
    return mapTreatment(treatment);
  }

  async update(id: string, dto: UpdateTreatmentDto): Promise<TreatmentDto> {
    await this.ensureExists(id);
    const treatment = await this.prisma.treatment.update({
      where: { id },
      data: this.toData(dto),
      include: TREATMENT_INCLUDE,
    });
    return mapTreatment(treatment);
  }

  /**
   * Maps a DTO to Prisma data, converting the incoming base64 image data URLs
   * (beforeImageUrl / afterImageUrl) into stored buffers + mime types.
   */
  private toData(
    dto: CreateTreatmentDto | UpdateTreatmentDto,
  ): Prisma.TreatmentUncheckedCreateInput {
    const { beforeImageUrl, afterImageUrl, ...rest } = dto;
    const data = { ...rest } as Prisma.TreatmentUncheckedCreateInput;

    const before = parseImageInput(beforeImageUrl);
    if (before !== undefined) {
      data.beforeImage = before?.data ?? null;
      data.beforeImageType = before?.mime ?? null;
    }
    const after = parseImageInput(afterImageUrl);
    if (after !== undefined) {
      data.afterImage = after?.data ?? null;
      data.afterImageType = after?.mime ?? null;
    }
    return data;
  }

  async remove(id: string): Promise<{ success: boolean }> {
    await this.ensureExists(id);
    await this.prisma.treatment.delete({ where: { id } });
    return { success: true };
  }

  private async ensureExists(id: string): Promise<void> {
    const count = await this.prisma.treatment.count({ where: { id } });
    if (!count) {
      throw new NotFoundException('Treatment not found');
    }
  }
}

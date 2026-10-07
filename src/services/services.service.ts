import { Injectable, NotFoundException } from '@nestjs/common';
import { ClinicService, Prisma } from '@prisma/client';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { Paginated } from '../common/interfaces/paginated.interface';
import {
  buildOrderBy,
  getPageParams,
  paginated,
} from '../common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { CreateServicesDto } from './dto/create-services.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListQueryDto): Promise<Paginated<ClinicService>> {
    const params = getPageParams(query);
    const where: Prisma.ClinicServiceWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const orderBy = buildOrderBy(
      query,
      ['name', 'category', 'price', 'durationMinutes'],
      {
        name: 'asc',
      },
    );
    const [data, total] = await Promise.all([
      this.prisma.clinicService.findMany({
        where,
        orderBy,
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.clinicService.count({ where }),
    ]);
    return paginated(data, total, params);
  }

  async findOne(id: string): Promise<ClinicService> {
    const service = await this.prisma.clinicService.findUnique({
      where: { id },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }
    return service;
  }

  create(dto: CreateServiceDto): Promise<ClinicService> {
    return this.prisma.clinicService.create({
      data: this.toData(dto),
    });
  }

  createMany(dto: CreateServicesDto): Promise<ClinicService[]> {
    const rows = dto.services.map((item) => this.toData(item));
    return this.prisma.clinicService.createManyAndReturn({ data: rows });
  }

  private toData(dto: CreateServiceDto): Prisma.ClinicServiceCreateInput {
    return {
      ...dto,
      parameterTemplate: dto.parameterTemplate as
        Prisma.InputJsonValue | undefined,
    };
  }

  async update(id: string, dto: UpdateServiceDto): Promise<ClinicService> {
    return this.prisma.clinicService.update({
      where: { id },
      data: {
        ...dto,
        parameterTemplate: dto.parameterTemplate as
          Prisma.InputJsonValue | undefined,
      },
    });
  }

  async remove(id: string): Promise<{ success: boolean }> {
    await this.prisma.clinicService.delete({ where: { id } });
    return { success: true };
  }
}

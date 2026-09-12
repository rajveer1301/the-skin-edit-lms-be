import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { Paginated } from '../common/interfaces/paginated.interface';
import { mapUser, UserDto } from '../common/mappers/user.mapper';
import {
  buildOrderBy,
  getPageParams,
  paginated,
} from '../common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

const DEFAULT_PASSWORD = 'password123';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListQueryDto): Promise<Paginated<UserDto>> {
    const params = getPageParams(query);
    const where: Prisma.UserWhereInput = query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' } },
            { lastName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const orderBy = buildOrderBy(
      query,
      ['firstName', 'lastName', 'role', 'createdAt'],
      {
        firstName: 'asc',
      },
    );
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(rows.map(mapUser), total, params);
  }

  async findOne(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Staff member not found');
    }
    return mapUser(user);
  }

  async create(dto: CreateStaffDto): Promise<UserDto> {
    const passwordHash = await bcrypt.hash(
      dto.password ?? DEFAULT_PASSWORD,
      10,
    );
    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        role: dto.role,
        active: dto.active,
        specialization: dto.specialization,
        registrationNumber: dto.registrationNumber,
        calendarColor: dto.calendarColor,
        workingHours: dto.workingHours,
        commissionPercent: dto.commissionPercent,
        passwordHash,
      },
    });
    return mapUser(user);
  }

  async update(id: string, dto: UpdateStaffDto): Promise<UserDto> {
    await this.ensureExists(id);
    const data: Prisma.UserUpdateInput = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email ? dto.email.toLowerCase() : undefined,
      phone: dto.phone,
      role: dto.role,
      active: dto.active,
      specialization: dto.specialization,
      registrationNumber: dto.registrationNumber,
      calendarColor: dto.calendarColor,
      workingHours: dto.workingHours,
      commissionPercent: dto.commissionPercent,
    };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    const user = await this.prisma.user.update({ where: { id }, data });
    return mapUser(user);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    await this.ensureExists(id);
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }

  private async ensureExists(id: string): Promise<void> {
    const count = await this.prisma.user.count({ where: { id } });
    if (!count) {
      throw new NotFoundException('Staff member not found');
    }
  }
}

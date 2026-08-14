import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { Paginated } from '../common/interfaces/paginated.interface';
import { getPageParams, paginated } from '../common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import {
  CouponDto,
  CouponUsageDto,
  mapCoupon,
  mapCouponUsage,
} from './coupon.mapper';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListQueryDto): Promise<Paginated<CouponDto>> {
    const params = getPageParams(query);
    const where: Prisma.CouponWhereInput = {};
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return paginated(rows.map(mapCoupon), total, params);
  }

  async findOne(id: string): Promise<CouponDto> {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    return mapCoupon(coupon);
  }

  async create(dto: CreateCouponDto): Promise<CouponDto> {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException('A coupon with this code already exists');
    }
    if (dto.type === 'PERCENT' && dto.value > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100');
    }
    const coupon = await this.prisma.coupon.create({
      data: {
        code,
        description: dto.description,
        type: dto.type,
        value: dto.value,
        minAmount: dto.minAmount,
        maxUses: dto.maxUses,
        validFrom: dto.validFrom,
        validTo: dto.validTo,
        active: dto.active ?? true,
      },
    });
    return mapCoupon(coupon);
  }

  async update(id: string, dto: UpdateCouponDto): Promise<CouponDto> {
    await this.ensureExists(id);
    const data: Prisma.CouponUpdateInput = { ...dto };
    if (dto.code) {
      data.code = dto.code.trim().toUpperCase();
    }
    const coupon = await this.prisma.coupon.update({ where: { id }, data });
    return mapCoupon(coupon);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    await this.ensureExists(id);
    await this.prisma.coupon.delete({ where: { id } });
    return { success: true };
  }

  /** Global coupon usage log across all coupons. */
  async allUsages(query: ListQueryDto): Promise<Paginated<CouponUsageDto>> {
    const params = getPageParams(query);
    const where: Prisma.CouponUsageWhereInput = {};
    if (query.search) {
      where.OR = [
        { couponCode: { contains: query.search, mode: 'insensitive' } },
        { patientName: { contains: query.search, mode: 'insensitive' } },
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.couponUsage.findMany({
        where,
        orderBy: { usedAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.couponUsage.count({ where }),
    ]);
    return paginated(rows.map(mapCouponUsage), total, params);
  }

  /** Usage history for a single coupon. */
  async usagesFor(
    id: string,
    query: ListQueryDto,
  ): Promise<Paginated<CouponUsageDto>> {
    await this.ensureExists(id);
    const params = getPageParams(query);
    const where: Prisma.CouponUsageWhereInput = { couponId: id };
    const [rows, total] = await Promise.all([
      this.prisma.couponUsage.findMany({
        where,
        orderBy: { usedAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.couponUsage.count({ where }),
    ]);
    return paginated(rows.map(mapCouponUsage), total, params);
  }

  private async ensureExists(id: string): Promise<void> {
    const count = await this.prisma.coupon.count({ where: { id } });
    if (!count) {
      throw new NotFoundException('Coupon not found');
    }
  }
}

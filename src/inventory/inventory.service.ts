import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Product, StockMovementType } from '@prisma/client';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { Paginated } from '../common/interfaces/paginated.interface';
import {
  buildOrderBy,
  getPageParams,
  paginated,
} from '../common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { mapStockMovement, StockMovementDto } from './stock-movement.mapper';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findProducts(query: ListQueryDto): Promise<Paginated<Product>> {
    const params = getPageParams(query);
    const where: Prisma.ProductWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { sku: { contains: query.search, mode: 'insensitive' } },
            { category: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const orderBy = buildOrderBy(
      query,
      ['name', 'sku', 'category', 'quantity'],
      { name: 'asc' },
    );
    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.product.count({ where }),
    ]);
    return paginated(data, total, params);
  }

  async findProduct(id: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  createProduct(dto: CreateProductDto): Promise<Product> {
    return this.prisma.product.create({ data: dto });
  }

  async updateProduct(id: string, dto: UpdateProductDto): Promise<Product> {
    await this.findProduct(id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async removeProduct(id: string): Promise<{ success: boolean }> {
    await this.findProduct(id);
    await this.prisma.product.delete({ where: { id } });
    return { success: true };
  }

  async findStockMovements(
    query: StockMovementQueryDto,
  ): Promise<Paginated<StockMovementDto>> {
    const params = getPageParams(query);
    const where: Prisma.StockMovementWhereInput = {};
    if (query.productId) where.productId = query.productId;
    if (query.search) {
      where.OR = [
        { product: { name: { contains: query.search, mode: 'insensitive' } } },
        { reason: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: { product: true },
        orderBy: { date: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return paginated(rows.map(mapStockMovement), total, params);
  }

  async createStockMovement(
    dto: CreateStockMovementDto,
    userId: string,
  ): Promise<StockMovementDto> {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const byUserName = user ? `${user.firstName} ${user.lastName}` : undefined;

    let newQuantity = product.quantity;
    if (dto.type === StockMovementType.IN) newQuantity += dto.quantity;
    else if (dto.type === StockMovementType.OUT)
      newQuantity = Math.max(0, product.quantity - dto.quantity);
    else newQuantity = dto.quantity;

    const [movement] = await this.prisma.$transaction([
      this.prisma.stockMovement.create({
        data: {
          productId: dto.productId,
          type: dto.type,
          quantity: dto.quantity,
          reason: dto.reason,
          byUserName,
        },
        include: { product: true },
      }),
      this.prisma.product.update({
        where: { id: dto.productId },
        data: { quantity: newQuantity },
      }),
    ]);
    return mapStockMovement(movement);
  }
}

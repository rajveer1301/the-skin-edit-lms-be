import { StockMovementType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateStockMovementDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @IsEnum(StockMovementType)
  type!: StockMovementType;

  @IsInt()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  treatmentId?: string;
}

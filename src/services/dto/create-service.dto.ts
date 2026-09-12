import { ServiceCategory } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateServiceDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(ServiceCategory)
  category!: ServiceCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  durationMinutes!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bufferMinutes?: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  hsnSac?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gstPercent?: number;

  @IsOptional()
  @IsBoolean()
  requiresPatchTest?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresConsent?: boolean;

  @IsOptional()
  @IsBoolean()
  isPackage?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultSessionCount?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean = true;
}

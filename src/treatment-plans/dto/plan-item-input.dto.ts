import { IsCalendarDate } from '../../common/utils/dates';
import { PlanItemKind } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  MinLength,
} from 'class-validator';

export class PlanItemInputDto {
  @IsString()
  @MinLength(1)
  serviceId!: string;

  @IsEnum(PlanItemKind)
  kind!: PlanItemKind;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  sessionCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  intervalDays?: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @IsCalendarDate()
  startDate?: string;
}

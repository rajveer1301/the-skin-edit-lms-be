import { TreatmentStatus } from '@prisma/client';
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

export class CreateTreatmentDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsString()
  @MinLength(1)
  serviceId!: string;

  @IsString()
  @MinLength(1)
  doctorId!: string;

  @IsString()
  @MinLength(1)
  date!: string;

  @IsEnum(TreatmentStatus)
  status!: TreatmentStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  sessionNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalSessions?: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsBoolean()
  isComplementary?: boolean;

  @IsOptional()
  @IsString()
  beforeImageUrl?: string;

  @IsOptional()
  @IsString()
  afterImageUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

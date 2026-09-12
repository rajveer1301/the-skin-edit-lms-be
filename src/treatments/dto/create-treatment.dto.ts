import { TreatmentArea, TreatmentStatus } from '@prisma/client';
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

  @IsOptional()
  @IsString()
  therapistName?: string;

  @IsOptional()
  @IsString()
  appointmentId?: string;

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

  @IsOptional()
  @IsEnum(TreatmentArea)
  treatmentArea?: TreatmentArea;

  @IsOptional()
  @IsString()
  parameters?: string;

  @IsOptional()
  @IsString()
  consumablesUsed?: string;

  @IsOptional()
  @IsString()
  adverseReaction?: string;

  @IsOptional()
  @IsString()
  aftercare?: string;

  @IsOptional()
  @IsString()
  nextSessionDate?: string;

  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsString()
  trichoscopyNotes?: string;

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
  beforeImageKey?: string;

  @IsOptional()
  @IsString()
  afterImageUrl?: string;

  @IsOptional()
  @IsString()
  afterImageKey?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

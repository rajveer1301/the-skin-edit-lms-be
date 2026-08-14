import { AppointmentStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsString()
  @MinLength(1)
  doctorId!: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsEnum(AppointmentStatus)
  status!: AppointmentStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

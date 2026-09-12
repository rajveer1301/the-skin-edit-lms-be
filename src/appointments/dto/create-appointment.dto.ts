import {
  AppointmentStatus,
  BookingSource,
  PrepStatus,
  ReminderChannel,
  TreatmentArea,
  VisitType,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
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

  @IsOptional()
  @IsEnum(VisitType)
  visitType?: VisitType;

  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @IsOptional()
  @IsEnum(TreatmentArea)
  treatmentArea?: TreatmentArea;

  @IsOptional()
  @IsInt()
  @Min(0)
  sessionNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalSessions?: number;

  @IsOptional()
  @IsEnum(PrepStatus)
  consentStatus?: PrepStatus;

  @IsOptional()
  @IsEnum(PrepStatus)
  patchTestStatus?: PrepStatus;

  @IsOptional()
  @IsString()
  room?: string;

  @IsOptional()
  @IsEnum(BookingSource)
  bookingSource?: BookingSource;

  @IsOptional()
  @IsEnum(ReminderChannel)
  reminderChannel?: ReminderChannel;

  @IsOptional()
  @IsNumber()
  @Min(0)
  depositExpected?: number;

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

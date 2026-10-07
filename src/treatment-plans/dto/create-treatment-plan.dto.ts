import { IsCalendarDate } from '../../common/utils/dates';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PlanItemInputDto } from './plan-item-input.dto';

export class CreateTreatmentPlanDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  appointmentId?: string;

  @IsOptional()
  @IsString()
  @IsCalendarDate()
  followUpDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PlanItemInputDto)
  items!: PlanItemInputDto[];
}

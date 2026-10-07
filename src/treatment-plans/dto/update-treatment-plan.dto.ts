import { PartialType } from '@nestjs/mapped-types';
import { PlanStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CreateTreatmentPlanDto } from './create-treatment-plan.dto';

export class UpdateTreatmentPlanDto extends PartialType(
  CreateTreatmentPlanDto,
) {
  @IsOptional()
  @IsEnum(PlanStatus)
  status?: PlanStatus;

  @IsOptional()
  @IsString()
  declinedReason?: string;
}

import { IsOptional, IsString } from 'class-validator';

export class DeclinePlanDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

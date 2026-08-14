import { Gender } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ConvertLeadDto {
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}

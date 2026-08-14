import { InvoiceStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class InvoiceQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsString()
  patientId?: string;
}

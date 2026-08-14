import { LeadStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class LeadQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;
}

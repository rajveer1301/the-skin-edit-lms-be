import { IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class TreatmentQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  patientId?: string;
}

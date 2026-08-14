import { IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class StockMovementQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  productId?: string;
}

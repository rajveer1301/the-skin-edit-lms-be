import { IsCalendarDate } from '../../common/utils/dates';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class RescheduleSittingDto {
  @IsString()
  @MinLength(10)
  @IsCalendarDate()
  date!: string;

  @IsOptional()
  @IsBoolean()
  shiftFollowing?: boolean;
}

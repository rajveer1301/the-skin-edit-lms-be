import { IsCalendarDate } from '../../common/utils/dates';
import { PaymentKind, PaymentMethod } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsInt,
  MaxLength,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsString()
  @MinLength(1)
  @IsCalendarDate()
  date!: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsEnum(PaymentKind)
  paymentKind?: PaymentKind;

  @IsOptional()
  @IsInt()
  @Min(1)
  instalmentNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  instalmentOf?: number;
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @MinLength(1)
  idempotencyKey?: string;
}

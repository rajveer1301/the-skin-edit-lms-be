import { PaymentMethod } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePaymentDto {
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsString()
  @MinLength(1)
  date!: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

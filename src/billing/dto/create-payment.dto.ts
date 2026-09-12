import { PaymentKind, PaymentMethod } from '@prisma/client';
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

  @IsOptional()
  @IsEnum(PaymentKind)
  paymentKind?: PaymentKind;

  @IsOptional()
  @IsNumber()
  @Min(1)
  instalmentNumber?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  instalmentOf?: number;
}

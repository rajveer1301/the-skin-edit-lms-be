import { IsCalendarDate } from '../../common/utils/dates';
import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsNumber,
  IsInt,
  MaxLength,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InvoiceItemInputDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  planItemId?: string;

  @IsOptional()
  @IsString()
  hsnSac?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gstPercent?: number;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  total?: number;
}

export class CreateInvoiceDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsOptional()
  @IsString()
  billedToName?: string;

  @IsOptional()
  @IsString()
  appointmentId?: string;

  @IsOptional()
  @IsString()
  treatmentId?: string;

  @IsOptional()
  @IsString()
  planId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemInputDto)
  items!: InvoiceItemInputDto[];

  @IsNumber()
  @Min(0)
  discount!: number;

  @IsNumber()
  @Min(0)
  tax!: number;

  @IsOptional()
  @IsNumber()
  cgst?: number;

  @IsOptional()
  @IsNumber()
  sgst?: number;

  @IsOptional()
  @IsNumber()
  roundOff?: number;

  @IsString()
  @MinLength(1)
  @IsCalendarDate()
  issuedDate!: string;

  @IsOptional()
  @IsString()
  @IsCalendarDate()
  dueDate?: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @MinLength(1)
  idempotencyKey?: string;
}

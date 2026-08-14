import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
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

  @IsNumber()
  @Min(0)
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemInputDto)
  items!: InvoiceItemInputDto[];

  @IsNumber()
  @Min(0)
  discount!: number;

  @IsNumber()
  @Min(0)
  tax!: number;

  @IsString()
  @MinLength(1)
  issuedDate!: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

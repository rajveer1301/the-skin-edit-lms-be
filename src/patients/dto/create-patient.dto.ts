import { Gender } from '@prisma/client';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreatePatientDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsEnum(Gender)
  gender!: Gender;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[] = [];

  @IsOptional()
  @IsString()
  allergyDetails?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medicalConditions?: string[] = [];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medications?: string[] = [];

  @IsOptional()
  @IsString()
  medicalHistory?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  previousProcedures?: string[] = [];

  @IsOptional()
  @IsString()
  pregnancyStatus?: string;

  @IsOptional()
  @IsString()
  referralSource?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skinConcerns?: string[] = [];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hairConcerns?: string[] = [];

  @IsOptional()
  @IsString()
  notes?: string;
}

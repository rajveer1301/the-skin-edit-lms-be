import {
  Gender,
  InterestCategory,
  LeadLostReason,
  LeadSource,
  LeadStatus,
} from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsEnum(LeadSource)
  source!: LeadSource;

  @IsEnum(LeadStatus)
  status!: LeadStatus;

  @IsOptional()
  @IsEnum(InterestCategory)
  interestCategory?: InterestCategory;

  @IsOptional()
  @IsString()
  interestedIn?: string;

  @IsOptional()
  @IsEnum(LeadLostReason)
  lostReason?: LeadLostReason;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  followUpDate?: string;
}

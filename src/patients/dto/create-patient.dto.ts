import {
  FitzpatrickType,
  Gender,
  HairLossScale,
  HairType,
  ReminderChannel,
  ScalpType,
} from '@prisma/client';
import {
  IsArray,
  IsBoolean,
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

  @IsOptional()
  @IsString()
  mrn?: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsOptional()
  @IsEnum(ReminderChannel)
  reminderChannel?: ReminderChannel;

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
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsString()
  lifestyleNotes?: string;

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
  @IsBoolean()
  familyHistoryAlopecia?: boolean;

  @IsOptional()
  @IsString()
  smokingStatus?: string;

  @IsOptional()
  @IsString()
  referralSource?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  billingName?: string;

  @IsOptional()
  @IsString()
  preferredLanguage?: string;

  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsString()
  emergencyContactRelation?: string;

  @IsOptional()
  @IsString()
  emergencyContactAlternatePhone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visitReasons?: string[] = [];

  @IsOptional()
  @IsString()
  visitReasonOther?: string;

  @IsOptional()
  @IsString()
  mainConcern?: string;

  @IsOptional()
  @IsString()
  referralSourceOther?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skinHairProfile?: string[] = [];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergyCategories?: string[] = [];

  @IsOptional()
  @IsString()
  recentProcedures?: string;

  @IsOptional()
  @IsString()
  homeCareProducts?: string;

  @IsOptional()
  @IsString()
  isotretinoinLast12Months?: string;

  @IsOptional()
  @IsString()
  isotretinoinWhen?: string;

  @IsOptional()
  @IsString()
  photosensitisingMedicines?: string;

  @IsOptional()
  @IsString()
  activeTreatmentAreaIssue?: string;

  @IsOptional()
  @IsString()
  upcomingEventOrSunExposure?: string;

  @IsOptional()
  @IsString()
  upcomingEventDate?: string;

  @IsOptional()
  @IsString()
  implantableDevices?: string;

  @IsOptional()
  @IsString()
  implantableDevicesDetails?: string;

  @IsOptional()
  @IsEnum(FitzpatrickType)
  fitzpatrickType?: FitzpatrickType;

  @IsOptional()
  @IsEnum(ScalpType)
  scalpType?: ScalpType;

  @IsOptional()
  @IsEnum(HairType)
  hairType?: HairType;

  @IsOptional()
  @IsEnum(HairLossScale)
  hairLossScale?: HairLossScale;

  @IsOptional()
  @IsString()
  hairLossGrade?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skinConcerns?: string[] = [];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hairConcerns?: string[] = [];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  wellnessConcerns?: string[] = [];

  @IsOptional()
  @IsString()
  notes?: string;
}

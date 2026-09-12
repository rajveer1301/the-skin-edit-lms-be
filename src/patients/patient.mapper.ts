import { Patient } from '@prisma/client';

export interface PatientDto {
  id: string;
  mrn?: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth?: string;
  phone: string;
  whatsapp?: string;
  reminderChannel?: string;
  email?: string;
  address?: string;
  city?: string;
  bloodGroup?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  occupation?: string;
  lifestyleNotes?: string;
  allergies: string[];
  allergyDetails?: string;
  medicalConditions: string[];
  medications: string[];
  medicalHistory?: string;
  previousProcedures: string[];
  pregnancyStatus?: string;
  familyHistoryAlopecia?: boolean;
  smokingStatus?: string;
  referralSource?: string;
  leadId?: string;
  billingName?: string;
  preferredLanguage?: string;
  maritalStatus?: string;
  pincode?: string;
  emergencyContactRelation?: string;
  emergencyContactAlternatePhone?: string;
  visitReasons: string[];
  visitReasonOther?: string;
  mainConcern?: string;
  referralSourceOther?: string;
  skinHairProfile: string[];
  allergyCategories: string[];
  recentProcedures?: string;
  homeCareProducts?: string;
  isotretinoinLast12Months?: string;
  isotretinoinWhen?: string;
  photosensitisingMedicines?: string;
  activeTreatmentAreaIssue?: string;
  upcomingEventOrSunExposure?: string;
  upcomingEventDate?: string;
  implantableDevices?: string;
  implantableDevicesDetails?: string;
  fitzpatrickType?: string;
  scalpType?: string;
  hairType?: string;
  hairLossScale?: string;
  hairLossGrade?: string;
  skinConcerns: string[];
  hairConcerns: string[];
  wellnessConcerns: string[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function mapPatient(p: Patient): PatientDto {
  return {
    id: p.id,
    mrn: p.mrn ?? undefined,
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender,
    dateOfBirth: p.dateOfBirth ?? undefined,
    phone: p.phone,
    whatsapp: p.whatsapp ?? undefined,
    reminderChannel: p.reminderChannel ?? undefined,
    email: p.email ?? undefined,
    address: p.address ?? undefined,
    city: p.city ?? undefined,
    bloodGroup: p.bloodGroup ?? undefined,
    emergencyContactName: p.emergencyContactName ?? undefined,
    emergencyContactPhone: p.emergencyContactPhone ?? undefined,
    occupation: p.occupation ?? undefined,
    lifestyleNotes: p.lifestyleNotes ?? undefined,
    allergies: p.allergies,
    allergyDetails: p.allergyDetails ?? undefined,
    medicalConditions: p.medicalConditions,
    medications: p.medications,
    medicalHistory: p.medicalHistory ?? undefined,
    previousProcedures: p.previousProcedures,
    pregnancyStatus: p.pregnancyStatus ?? undefined,
    familyHistoryAlopecia: p.familyHistoryAlopecia ?? undefined,
    smokingStatus: p.smokingStatus ?? undefined,
    referralSource: p.referralSource ?? undefined,
    leadId: p.leadId ?? undefined,
    billingName: p.billingName ?? undefined,
    preferredLanguage: p.preferredLanguage ?? undefined,
    maritalStatus: p.maritalStatus ?? undefined,
    pincode: p.pincode ?? undefined,
    emergencyContactRelation: p.emergencyContactRelation ?? undefined,
    emergencyContactAlternatePhone: p.emergencyContactAlternatePhone ?? undefined,
    visitReasons: p.visitReasons ?? [],
    visitReasonOther: p.visitReasonOther ?? undefined,
    mainConcern: p.mainConcern ?? undefined,
    referralSourceOther: p.referralSourceOther ?? undefined,
    skinHairProfile: p.skinHairProfile ?? [],
    allergyCategories: p.allergyCategories ?? [],
    recentProcedures: p.recentProcedures ?? undefined,
    homeCareProducts: p.homeCareProducts ?? undefined,
    isotretinoinLast12Months: p.isotretinoinLast12Months ?? undefined,
    isotretinoinWhen: p.isotretinoinWhen ?? undefined,
    photosensitisingMedicines: p.photosensitisingMedicines ?? undefined,
    activeTreatmentAreaIssue: p.activeTreatmentAreaIssue ?? undefined,
    upcomingEventOrSunExposure: p.upcomingEventOrSunExposure ?? undefined,
    upcomingEventDate: p.upcomingEventDate ?? undefined,
    implantableDevices: p.implantableDevices ?? undefined,
    implantableDevicesDetails: p.implantableDevicesDetails ?? undefined,
    fitzpatrickType: p.fitzpatrickType ?? undefined,
    scalpType: p.scalpType ?? undefined,
    hairType: p.hairType ?? undefined,
    hairLossScale: p.hairLossScale ?? undefined,
    hairLossGrade: p.hairLossGrade ?? undefined,
    skinConcerns: p.skinConcerns,
    hairConcerns: p.hairConcerns,
    wellnessConcerns: p.wellnessConcerns,
    notes: p.notes ?? undefined,
    createdAt: p.createdAt?.toISOString(),
    updatedAt: p.updatedAt?.toISOString(),
  };
}

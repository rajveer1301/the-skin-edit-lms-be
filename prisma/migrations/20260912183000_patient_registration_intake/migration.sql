-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "maritalStatus" TEXT;
ALTER TABLE "Patient" ADD COLUMN "pincode" TEXT;
ALTER TABLE "Patient" ADD COLUMN "emergencyContactRelation" TEXT;
ALTER TABLE "Patient" ADD COLUMN "emergencyContactAlternatePhone" TEXT;
ALTER TABLE "Patient" ADD COLUMN "visitReasons" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Patient" ADD COLUMN "visitReasonOther" TEXT;
ALTER TABLE "Patient" ADD COLUMN "mainConcern" TEXT;
ALTER TABLE "Patient" ADD COLUMN "referralSourceOther" TEXT;
ALTER TABLE "Patient" ADD COLUMN "skinHairProfile" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Patient" ADD COLUMN "allergyCategories" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Patient" ADD COLUMN "recentProcedures" TEXT;
ALTER TABLE "Patient" ADD COLUMN "homeCareProducts" TEXT;
ALTER TABLE "Patient" ADD COLUMN "isotretinoinLast12Months" TEXT;
ALTER TABLE "Patient" ADD COLUMN "isotretinoinWhen" TEXT;
ALTER TABLE "Patient" ADD COLUMN "photosensitisingMedicines" TEXT;
ALTER TABLE "Patient" ADD COLUMN "activeTreatmentAreaIssue" TEXT;
ALTER TABLE "Patient" ADD COLUMN "upcomingEventOrSunExposure" TEXT;
ALTER TABLE "Patient" ADD COLUMN "upcomingEventDate" TEXT;

-- AlterTable
ALTER TABLE "Patient"
ALTER COLUMN "medicalConditions" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "medications" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "previousProcedures" SET DEFAULT ARRAY[]::TEXT[];

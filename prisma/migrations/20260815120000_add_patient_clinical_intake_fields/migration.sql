ALTER TABLE "Patient"
ADD COLUMN "allergyDetails" TEXT,
ADD COLUMN "medicalConditions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "medications" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "previousProcedures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "pregnancyStatus" TEXT,
ADD COLUMN "referralSource" TEXT;

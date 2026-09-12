-- Treatment photos move from Postgres bytea to object storage keys.
ALTER TABLE "Treatment" ADD COLUMN "beforeImageKey" TEXT;
ALTER TABLE "Treatment" ADD COLUMN "afterImageKey" TEXT;
ALTER TABLE "Treatment" DROP COLUMN IF EXISTS "beforeImage";
ALTER TABLE "Treatment" DROP COLUMN IF EXISTS "afterImage";

CREATE TABLE "PatientDocument" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PatientDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PatientDocument_patientId_uploadedAt_idx" ON "PatientDocument"("patientId", "uploadedAt");

ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

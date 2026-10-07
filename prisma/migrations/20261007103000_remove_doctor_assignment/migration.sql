-- Drop clinician assignment from appointments and treatments (single-doctor clinic).
DROP INDEX IF EXISTS "Appointment_doctorId_startTime_idx";

ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "Appointment_doctorId_fkey";
ALTER TABLE "Treatment" DROP CONSTRAINT IF EXISTS "Treatment_doctorId_fkey";

ALTER TABLE "Appointment" DROP COLUMN IF EXISTS "doctorId";
ALTER TABLE "Treatment" DROP COLUMN IF EXISTS "doctorId";

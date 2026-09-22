-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "driveFolderId" TEXT,
ALTER COLUMN "medicalConditions" DROP DEFAULT,
ALTER COLUMN "medications" DROP DEFAULT,
ALTER COLUMN "previousProcedures" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PatientDocument" ADD COLUMN     "driveFileId" TEXT,
ADD COLUMN     "driveSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Treatment" ADD COLUMN     "afterImageDriveId" TEXT,
ADD COLUMN     "beforeImageDriveId" TEXT,
ADD COLUMN     "imagesDriveSyncedAt" TIMESTAMP(3);

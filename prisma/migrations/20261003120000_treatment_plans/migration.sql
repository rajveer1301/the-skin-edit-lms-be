-- CreateEnum
CREATE TYPE "ConsultDecision" AS ENUM ('OPEN', 'REPORTS_PENDING', 'AWAITING_DECISION', 'PROCEED', 'DECLINED');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED');

-- CreateEnum
CREATE TYPE "PlanItemKind" AS ENUM ('PACKAGE', 'SINGLE', 'COMPLEMENTARY');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "decision" "ConsultDecision" NOT NULL DEFAULT 'OPEN',
ADD COLUMN "followUpDate" TEXT;

-- AlterTable
ALTER TABLE "ClinicService" ADD COLUMN "defaultIntervalDays" INTEGER,
ADD COLUMN "parameterTemplate" JSONB;

-- CreateTable
CREATE TABLE "TreatmentPlan" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'PROPOSED',
    "followUpDate" TEXT,
    "declinedReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "kind" "PlanItemKind" NOT NULL,
    "sessionCount" INTEGER NOT NULL,
    "intervalDays" INTEGER,
    "price" DOUBLE PRECISION NOT NULL,
    "startDate" TEXT,
    "parameterTemplate" JSONB,

    CONSTRAINT "TreatmentPlanItem_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Treatment" ADD COLUMN "planItemId" TEXT,
ADD COLUMN "readings" JSONB;

-- AlterTable
ALTER TABLE "PatientDocument" ADD COLUMN "planId" TEXT,
ADD COLUMN "appointmentId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "planId" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN "planItemId" TEXT;

-- CreateIndex
CREATE INDEX "TreatmentPlan_patientId_status_idx" ON "TreatmentPlan"("patientId", "status");

-- CreateIndex
CREATE INDEX "TreatmentPlan_followUpDate_idx" ON "TreatmentPlan"("followUpDate");

-- CreateIndex
CREATE INDEX "TreatmentPlanItem_planId_idx" ON "TreatmentPlanItem"("planId");

-- CreateIndex
CREATE INDEX "Treatment_planItemId_idx" ON "Treatment"("planItemId");

-- CreateIndex
CREATE INDEX "PatientDocument_planId_idx" ON "PatientDocument"("planId");

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlanItem" ADD CONSTRAINT "TreatmentPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlanItem" ADD CONSTRAINT "TreatmentPlanItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ClinicService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "TreatmentPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "TreatmentPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Run atomically. Existing duplicate links need review, never silent deletion.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "CouponUsage" WHERE "invoiceId" IS NOT NULL GROUP BY "invoiceId" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Resolve duplicate CouponUsage.invoiceId records before applying integrity migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "Treatment" WHERE "planItemId" IS NOT NULL AND "sessionNumber" IS NOT NULL GROUP BY "planItemId", "sessionNumber" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Resolve duplicate plan sittings before applying integrity migration';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "couponDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "couponSnapshot" JSONB,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "manualDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "requestHash" TEXT;

-- AlterTable
ALTER TABLE "PatientDocument" ADD COLUMN     "syncAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "syncAttempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "requestHash" TEXT;

-- AlterTable
ALTER TABLE "Treatment" ADD COLUMN     "syncAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "syncAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "NumberCounter" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "NumberCounter_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "FileCleanup" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileCleanup_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "JobLease" (
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLease_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "FileCleanup_nextAttemptAt_idx" ON "FileCleanup"("nextAttemptAt");

-- CreateIndex
CREATE INDEX "Appointment_startTime_id_idx" ON "Appointment"("startTime", "id");

-- CreateIndex
CREATE INDEX "Appointment_patientId_startTime_id_idx" ON "Appointment"("patientId", "startTime", "id");

-- CreateIndex
CREATE INDEX "Appointment_doctorId_startTime_idx" ON "Appointment"("doctorId", "startTime");

-- CreateIndex
CREATE INDEX "Appointment_createdAt_id_idx" ON "Appointment"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Appointment_decision_followUpDate_idx" ON "Appointment"("decision", "followUpDate");

-- CreateIndex
CREATE INDEX "CouponUsage_couponId_usedAt_idx" ON "CouponUsage"("couponId", "usedAt");

-- CreateIndex
CREATE INDEX "CouponUsage_couponId_patientId_idx" ON "CouponUsage"("couponId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponUsage_invoiceId_key" ON "CouponUsage"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_idempotencyKey_key" ON "Invoice"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Invoice_patientId_createdAt_id_idx" ON "Invoice"("patientId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Invoice_createdAt_id_idx" ON "Invoice"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Invoice_status_createdAt_idx" ON "Invoice"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_planId_idx" ON "Invoice"("planId");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_planItemId_idx" ON "InvoiceItem"("planItemId");

-- CreateIndex
CREATE INDEX "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_createdAt_id_idx" ON "Lead"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Patient_createdAt_id_idx" ON "Patient"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Patient_leadId_idx" ON "Patient"("leadId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_date_id_idx" ON "Payment"("invoiceId", "date", "id");

-- CreateIndex
CREATE INDEX "Payment_date_id_idx" ON "Payment"("date", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_invoiceId_idempotencyKey_key" ON "Payment"("invoiceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StockMovement_productId_date_id_idx" ON "StockMovement"("productId", "date", "id");

-- CreateIndex
CREATE INDEX "StockMovement_date_id_idx" ON "StockMovement"("date", "id");

-- CreateIndex
CREATE INDEX "Treatment_patientId_date_id_idx" ON "Treatment"("patientId", "date", "id");

-- CreateIndex
CREATE INDEX "Treatment_date_id_idx" ON "Treatment"("date", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Treatment_planItemId_sessionNumber_key" ON "Treatment"("planItemId", "sessionNumber");

-- CreateIndex
CREATE INDEX "TreatmentPlan_createdAt_id_idx" ON "TreatmentPlan"("createdAt", "id");


-- Preserve existing invoice discounts; the old schema did not separate their origin.
UPDATE "Invoice" i SET "couponDiscount" = CASE WHEN i."couponId" IS NULL THEN 0 ELSE
  LEAST(i.discount, COALESCE((SELECT u."discountAmount" FROM "CouponUsage" u WHERE u."invoiceId" = i.id), i.discount)) END;
UPDATE "Invoice" SET "manualDiscount" = CASE WHEN discount > "couponDiscount" THEN discount ELSE 0 END;
UPDATE "Invoice" i SET "couponSnapshot" = jsonb_build_object('type', c.type, 'value', c.value)
FROM "Coupon" c WHERE i."couponId" = c.id;

-- Start above existing numbers, including historical gaps and deletions.
INSERT INTO "NumberCounter" (name, value)
SELECT regexp_replace(number, '-[0-9]+$', ''), MAX(substring(number from '([0-9]+)$')::integer)
FROM "Invoice" WHERE number ~ '^INV-[0-9]{4}-[0-9]+$' GROUP BY 1;
INSERT INTO "NumberCounter" (name, value)
SELECT regexp_replace("receiptNumber", '-[0-9]+$', ''), MAX(substring("receiptNumber" from '([0-9]+)$')::integer)
FROM "Payment" WHERE "receiptNumber" ~ '^RCP-[0-9]{4}-[0-9]+$' GROUP BY 1;

-- These enforce new writes without rewriting or discarding invalid legacy records.
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_time_order" CHECK ("endTime" > "startTime") NOT VALID;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_positive_quantity" CHECK (quantity > 0 AND "unitPrice" >= 0) NOT VALID;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_nonnegative_total" CHECK (total >= 0 AND discount >= 0 AND discount <= subtotal) NOT VALID;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_positive_amount" CHECK (amount > 0) NOT VALID;
ALTER TABLE "Product" ADD CONSTRAINT "Product_nonnegative_quantity" CHECK (quantity >= 0) NOT VALID;

CREATE INDEX "PatientDocument_pending_sync_idx" ON "PatientDocument" ("syncAfter", id) WHERE "driveFileId" IS NULL;
CREATE INDEX "Treatment_pending_sync_idx" ON "Treatment" ("syncAfter", id)
WHERE ("beforeImageKey" IS NOT NULL AND "beforeImageDriveId" IS NULL) OR ("afterImageKey" IS NOT NULL AND "afterImageDriveId" IS NULL);
COMMIT;

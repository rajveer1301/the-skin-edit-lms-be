-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "receiptNumber" TEXT;

-- Backfill existing payments with stable RCP numbers
UPDATE "Payment" AS p
SET "receiptNumber" = 'RCP-' || to_char(CURRENT_DATE, 'YYYY') || '-' || LPAD(n.rn::text, 3, '0')
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY date, id) AS rn
  FROM "Payment"
) AS n
WHERE p.id = n.id AND p."receiptNumber" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNumber_key" ON "Payment"("receiptNumber");

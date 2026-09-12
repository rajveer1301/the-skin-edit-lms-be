-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('ADVANCE', 'INSTALMENT', 'SESSION', 'FINAL');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "paymentKind" "PaymentKind";
ALTER TABLE "Payment" ADD COLUMN "instalmentNumber" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "instalmentOf" INTEGER;

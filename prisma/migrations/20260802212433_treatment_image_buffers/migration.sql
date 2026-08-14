/*
  Warnings:

  - You are about to drop the column `afterImageUrl` on the `Treatment` table. All the data in the column will be lost.
  - You are about to drop the column `beforeImageUrl` on the `Treatment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Treatment" DROP COLUMN "afterImageUrl",
DROP COLUMN "beforeImageUrl",
ADD COLUMN     "afterImage" BYTEA,
ADD COLUMN     "afterImageType" TEXT,
ADD COLUMN     "beforeImage" BYTEA,
ADD COLUMN     "beforeImageType" TEXT;

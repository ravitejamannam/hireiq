-- AlterTable
ALTER TABLE "AssessmentBankQuestion" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "timesUsed" INTEGER NOT NULL DEFAULT 0;

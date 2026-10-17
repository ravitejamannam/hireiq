-- CreateEnum
CREATE TYPE "EmailDeliveryOutcome" AS ENUM ('SENT', 'PROVIDER_NOT_CONFIGURED', 'MISSING_RECIPIENT', 'PROVIDER_ERROR');

-- AlterTable
ALTER TABLE "Application" ADD COLUMN "candidateStageEmailStatus" "EmailDeliveryOutcome";

-- AlterTable
ALTER TABLE "Interview" ADD COLUMN "bookingEmailStatus" "EmailDeliveryOutcome";

-- Guard against destructive enum replacement when source-unsupported OFFER rows exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Application" WHERE "status" = 'OFFER') THEN
    RAISE EXCEPTION 'Cannot migrate Application.status: OFFER rows exist and require explicit product resolution.';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "ApplicationPipelineStatus" AS ENUM ('CV_POOL', 'EXPERT_REVIEW', 'TECH_EVALUATION', 'SHORTLISTED', 'SELECTED', 'REJECTED', 'HIRED');

-- AlterTable
ALTER TABLE "Candidate"
ADD COLUMN "location" TEXT,
ADD COLUMN "currentEmployer" TEXT,
ADD COLUMN "skills" TEXT,
ADD COLUMN "expectedCTC" TEXT;

-- AlterTable
ALTER TABLE "Application"
ADD COLUMN "source" "SourcingDatabaseSource",
ADD COLUMN "expertScore" INTEGER,
ADD COLUMN "rejectionReason" TEXT;

-- Rebuild status index around the enum type conversion.
DROP INDEX "Application_jobId_status_idx";

ALTER TABLE "Application"
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" TYPE "ApplicationPipelineStatus"
USING (
  CASE "status"::text
    WHEN 'APPLIED' THEN 'CV_POOL'
    WHEN 'SCREENING' THEN 'EXPERT_REVIEW'
    WHEN 'INTERVIEWING' THEN 'TECH_EVALUATION'
    WHEN 'HIRED' THEN 'HIRED'
    WHEN 'REJECTED' THEN 'REJECTED'
  END
)::"ApplicationPipelineStatus",
ALTER COLUMN "status" SET DEFAULT 'CV_POOL';

CREATE INDEX "Application_jobId_status_idx" ON "Application"("jobId", "status");

-- DropEnum
DROP TYPE "ApplicationStatus";

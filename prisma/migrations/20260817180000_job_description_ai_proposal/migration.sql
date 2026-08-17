-- T82: AI job-description proposal fields on JobSpecificationVersion.
-- Additive. Does not alter lifecycle, timestamps, assignment, or billing.

CREATE TYPE "JobDescriptionAiGenerationStatus" AS ENUM ('NONE', 'GENERATING', 'READY', 'FAILED');

ALTER TABLE "JobSpecificationVersion"
ADD COLUMN "aiProposedJobDescription" TEXT,
ADD COLUMN "aiGeneratedAt" TIMESTAMP(3),
ADD COLUMN "aiGenerationStatus" "JobDescriptionAiGenerationStatus" NOT NULL DEFAULT 'NONE';

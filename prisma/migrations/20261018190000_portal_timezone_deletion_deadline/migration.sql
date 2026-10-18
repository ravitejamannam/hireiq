ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "candidateTimeZone" TEXT;

ALTER TABLE "CandidateDeletionRequest" ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3);
ALTER TABLE "CandidateDeletionRequest" ADD COLUMN IF NOT EXISTS "decisionReason" TEXT;
ALTER TABLE "CandidateDeletionRequest" ADD COLUMN IF NOT EXISTS "decidedByUserId" INTEGER;

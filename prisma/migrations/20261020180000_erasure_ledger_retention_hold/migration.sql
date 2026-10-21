-- Erasure tombstone, erasure ledger, retention holds, and tenant scope on queued email. Additive only.
ALTER TYPE "OutboundEmailStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "Candidate" ADD COLUMN "erasedAt" TIMESTAMP(3);
ALTER TABLE "OutboundEmailAttempt" ADD COLUMN "companyId" INTEGER, ADD COLUMN "candidateId" INTEGER;
CREATE INDEX "OutboundEmailAttempt_companyId_candidateId_idx" ON "OutboundEmailAttempt"("companyId", "candidateId");

CREATE TABLE "CandidateErasure" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "candidateId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "trigger" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "completedSteps" TEXT[],
  "failedSteps" TEXT[],
  "requestedByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "CandidateErasure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CandidateErasure_companyId_candidateId_key" ON "CandidateErasure"("companyId", "candidateId");
CREATE INDEX "CandidateErasure_status_updatedAt_idx" ON "CandidateErasure"("status", "updatedAt");
ALTER TABLE "CandidateErasure" ADD CONSTRAINT "CandidateErasure_candidateId_companyId_fkey"
  FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RetentionHold" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "candidateId" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "placedByUserId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  CONSTRAINT "RetentionHold_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RetentionHold_companyId_candidateId_idx" ON "RetentionHold"("companyId", "candidateId");
ALTER TABLE "RetentionHold" ADD CONSTRAINT "RetentionHold_candidateId_companyId_fkey"
  FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- T92: derived CandidateIntelligenceRun + CandidateClaim.
-- Additive. Does not alter Candidate, CandidateProfile, identity,
-- CandidateEvidence, Application pipeline, Application.source, ingestion, or JWT.
-- Does not store prompts, model responses, embeddings, scores, or files.
-- Does not backfill intelligence or call a provider.

-- CreateEnum
CREATE TYPE "CandidateIntelligenceRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CandidateIntelligenceExtractorType" AS ENUM ('COVER_LETTER_CLAIMS');

-- CreateEnum
CREATE TYPE "CandidateClaimType" AS ENUM ('SKILL', 'EMPLOYER', 'JOB_TITLE', 'LOCATION');

-- CreateTable
CREATE TABLE "CandidateIntelligenceRun" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "evidenceId" INTEGER NOT NULL,
    "status" "CandidateIntelligenceRunStatus" NOT NULL,
    "extractorType" "CandidateIntelligenceExtractorType" NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "durationMs" INTEGER,

    CONSTRAINT "CandidateIntelligenceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateClaim" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "runId" INTEGER NOT NULL,
    "evidenceId" INTEGER NOT NULL,
    "claimType" "CandidateClaimType" NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateIntelligenceRun_id_companyId_key" ON "CandidateIntelligenceRun"("id", "companyId");

-- CreateIndex
CREATE INDEX "CandidateIntelligenceRun_companyId_candidateId_createdAt_idx" ON "CandidateIntelligenceRun"("companyId", "candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "CandidateIntelligenceRun_companyId_evidenceId_idx" ON "CandidateIntelligenceRun"("companyId", "evidenceId");

-- CreateIndex
CREATE INDEX "CandidateIntelligenceRun_status_idx" ON "CandidateIntelligenceRun"("status");

-- Partial unique: one COMPLETED run per extraction key.
CREATE UNIQUE INDEX "CandidateIntelligenceRun_completed_idempotency_key"
ON "CandidateIntelligenceRun" (
    "companyId",
    "candidateId",
    "evidenceId",
    "extractorType",
    "extractorVersion",
    "modelProvider",
    "modelName",
    "promptVersion"
)
WHERE "status" = 'COMPLETED';

-- CreateIndex
CREATE INDEX "CandidateClaim_companyId_candidateId_claimType_idx" ON "CandidateClaim"("companyId", "candidateId", "claimType");

-- CreateIndex
CREATE INDEX "CandidateClaim_runId_idx" ON "CandidateClaim"("runId");

-- CreateIndex
CREATE INDEX "CandidateClaim_evidenceId_idx" ON "CandidateClaim"("evidenceId");

-- AddForeignKey
ALTER TABLE "CandidateIntelligenceRun" ADD CONSTRAINT "CandidateIntelligenceRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateIntelligenceRun" ADD CONSTRAINT "CandidateIntelligenceRun_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateIntelligenceRun" ADD CONSTRAINT "CandidateIntelligenceRun_evidenceId_companyId_fkey" FOREIGN KEY ("evidenceId", "companyId") REFERENCES "CandidateEvidence"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateClaim" ADD CONSTRAINT "CandidateClaim_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateClaim" ADD CONSTRAINT "CandidateClaim_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateClaim" ADD CONSTRAINT "CandidateClaim_runId_companyId_fkey" FOREIGN KEY ("runId", "companyId") REFERENCES "CandidateIntelligenceRun"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateClaim" ADD CONSTRAINT "CandidateClaim_evidenceId_companyId_fkey" FOREIGN KEY ("evidenceId", "companyId") REFERENCES "CandidateEvidence"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

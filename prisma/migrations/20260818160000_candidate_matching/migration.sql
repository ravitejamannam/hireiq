-- T93: CandidateMatchRun + RequirementMatch.
-- Additive. Does not alter Candidate, CandidateProfile, identity,
-- CandidateEvidence, CandidateIntelligenceRun, CandidateClaim semantics,
-- Application pipeline, Application.source, JobSpecificationVersion fields, or JWT.
-- CandidateClaim gained additive @@unique([id, companyId]) for tenant-safe citation FKs.
-- Does not backfill matching. Does not call a provider.

-- CreateEnum
CREATE TYPE "CandidateMatchRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CandidateMatchResult" AS ENUM ('SATISFIED', 'UNKNOWN', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "CandidateMatchRequirementCategory" AS ENUM ('SKILL', 'LOCATION', 'MUST_HAVE', 'NICE_TO_HAVE');

-- Tenant-safe composite unique for RequirementMatch → CandidateClaim FK (additive).
CREATE UNIQUE INDEX "CandidateClaim_id_companyId_key" ON "CandidateClaim"("id", "companyId");

-- CreateTable
CREATE TABLE "CandidateMatchRun" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "jobSpecificationVersionId" INTEGER NOT NULL,
    "status" "CandidateMatchRunStatus" NOT NULL,
    "matcherVersion" TEXT NOT NULL,
    "requirementParseVersion" TEXT NOT NULL,
    "aliasMapVersion" TEXT NOT NULL,
    "intelligenceSnapshotHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,

    CONSTRAINT "CandidateMatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementMatch" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "runId" INTEGER NOT NULL,
    "requirementKey" TEXT NOT NULL,
    "sourceField" TEXT NOT NULL,
    "category" "CandidateMatchRequirementCategory" NOT NULL,
    "result" "CandidateMatchResult" NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "claimId" INTEGER,
    "evidenceId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateMatchRun_id_companyId_key" ON "CandidateMatchRun"("id", "companyId");

-- CreateIndex
CREATE INDEX "CandidateMatchRun_companyId_applicationId_createdAt_idx" ON "CandidateMatchRun"("companyId", "applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "CandidateMatchRun_companyId_candidateId_createdAt_idx" ON "CandidateMatchRun"("companyId", "candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "CandidateMatchRun_companyId_jobSpecificationVersionId_createdAt_idx" ON "CandidateMatchRun"("companyId", "jobSpecificationVersionId", "createdAt");

-- Partial unique: one COMPLETED run per matching snapshot.
CREATE UNIQUE INDEX "CandidateMatchRun_completed_idempotency_key"
ON "CandidateMatchRun" (
    "companyId",
    "applicationId",
    "jobSpecificationVersionId",
    "matcherVersion",
    "requirementParseVersion",
    "aliasMapVersion",
    "intelligenceSnapshotHash"
)
WHERE "status" = 'COMPLETED';

-- CreateIndex
CREATE INDEX "RequirementMatch_companyId_runId_idx" ON "RequirementMatch"("companyId", "runId");

-- CreateIndex
CREATE INDEX "RequirementMatch_companyId_claimId_idx" ON "RequirementMatch"("companyId", "claimId");

-- CreateIndex
CREATE INDEX "RequirementMatch_companyId_evidenceId_idx" ON "RequirementMatch"("companyId", "evidenceId");

-- AddForeignKey
ALTER TABLE "CandidateMatchRun" ADD CONSTRAINT "CandidateMatchRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateMatchRun" ADD CONSTRAINT "CandidateMatchRun_applicationId_companyId_fkey" FOREIGN KEY ("applicationId", "companyId") REFERENCES "Application"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateMatchRun" ADD CONSTRAINT "CandidateMatchRun_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateMatchRun" ADD CONSTRAINT "CandidateMatchRun_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateMatchRun" ADD CONSTRAINT "CandidateMatchRun_jobSpecificationVersionId_fkey" FOREIGN KEY ("jobSpecificationVersionId") REFERENCES "JobSpecificationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RequirementMatch" ADD CONSTRAINT "RequirementMatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RequirementMatch" ADD CONSTRAINT "RequirementMatch_runId_companyId_fkey" FOREIGN KEY ("runId", "companyId") REFERENCES "CandidateMatchRun"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RequirementMatch" ADD CONSTRAINT "RequirementMatch_claimId_companyId_fkey" FOREIGN KEY ("claimId", "companyId") REFERENCES "CandidateClaim"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RequirementMatch" ADD CONSTRAINT "RequirementMatch_evidenceId_companyId_fkey" FOREIGN KEY ("evidenceId", "companyId") REFERENCES "CandidateEvidence"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

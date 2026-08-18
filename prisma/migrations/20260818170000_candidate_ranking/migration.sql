-- T94: JobRankingRun + JobRankingResult.
-- Additive. Does not alter Candidate, CandidateProfile, identity,
-- CandidateEvidence, CandidateIntelligenceRun, CandidateClaim,
-- CandidateMatchRun/RequirementMatch semantics, Application pipeline,
-- Application.source, Application.expertScore, JobSpecificationVersion fields, or JWT.
-- Does not backfill ranking. Does not call a provider. No quality/fit scores.

-- CreateEnum
CREATE TYPE "JobRankingRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobRankingCoverageStatus" AS ENUM ('RANKED', 'UNRANKED_NO_MATCH');

-- CreateTable
CREATE TABLE "JobRankingRun" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "jobSpecificationVersionId" INTEGER NOT NULL,
    "status" "JobRankingRunStatus" NOT NULL,
    "rankingPolicyVersion" TEXT NOT NULL,
    "matcherVersion" TEXT NOT NULL,
    "requirementParseVersion" TEXT NOT NULL,
    "aliasMapVersion" TEXT NOT NULL,
    "applicationSetHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "durationMs" INTEGER,
    "rankedCount" INTEGER NOT NULL DEFAULT 0,
    "unrankedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobRankingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRankingResult" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "candidateMatchRunId" INTEGER,
    "rank" INTEGER,
    "satisfiedSkillCount" INTEGER,
    "unknownSkillCount" INTEGER,
    "coverageStatus" "JobRankingCoverageStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRankingResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobRankingRun_id_companyId_key" ON "JobRankingRun"("id", "companyId");

-- CreateIndex
CREATE INDEX "JobRankingRun_companyId_jobId_createdAt_idx" ON "JobRankingRun"("companyId", "jobId", "createdAt");

-- CreateIndex
CREATE INDEX "JobRankingRun_companyId_jobSpecificationVersionId_createdAt_idx" ON "JobRankingRun"("companyId", "jobSpecificationVersionId", "createdAt");

-- Partial unique: one COMPLETED run per ranking snapshot.
CREATE UNIQUE INDEX "JobRankingRun_completed_idempotency_key"
ON "JobRankingRun" (
    "companyId",
    "jobId",
    "jobSpecificationVersionId",
    "rankingPolicyVersion",
    "matcherVersion",
    "requirementParseVersion",
    "aliasMapVersion",
    "applicationSetHash"
)
WHERE "status" = 'COMPLETED';

-- CreateIndex
CREATE INDEX "JobRankingResult_companyId_runId_idx" ON "JobRankingResult"("companyId", "runId");

-- CreateIndex
CREATE INDEX "JobRankingResult_companyId_applicationId_idx" ON "JobRankingResult"("companyId", "applicationId");

-- CreateIndex
CREATE INDEX "JobRankingResult_companyId_candidateId_idx" ON "JobRankingResult"("companyId", "candidateId");

-- CreateIndex
CREATE INDEX "JobRankingResult_companyId_candidateMatchRunId_idx" ON "JobRankingResult"("companyId", "candidateMatchRunId");

-- AddForeignKey
ALTER TABLE "JobRankingRun" ADD CONSTRAINT "JobRankingRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobRankingRun" ADD CONSTRAINT "JobRankingRun_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobRankingRun" ADD CONSTRAINT "JobRankingRun_jobSpecificationVersionId_fkey" FOREIGN KEY ("jobSpecificationVersionId") REFERENCES "JobSpecificationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobRankingResult" ADD CONSTRAINT "JobRankingResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobRankingResult" ADD CONSTRAINT "JobRankingResult_runId_companyId_fkey" FOREIGN KEY ("runId", "companyId") REFERENCES "JobRankingRun"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobRankingResult" ADD CONSTRAINT "JobRankingResult_applicationId_companyId_fkey" FOREIGN KEY ("applicationId", "companyId") REFERENCES "Application"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobRankingResult" ADD CONSTRAINT "JobRankingResult_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobRankingResult" ADD CONSTRAINT "JobRankingResult_candidateMatchRunId_companyId_fkey" FOREIGN KEY ("candidateMatchRunId", "companyId") REFERENCES "CandidateMatchRun"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

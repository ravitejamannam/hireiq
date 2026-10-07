-- Additive M10 hybrid retrieval. Does not alter M8, M9, matching, or application status.

CREATE TYPE "HybridRetrievalRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "HybridRetrievalRun" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "jobSpecificationVersionId" INTEGER NOT NULL,
    "lexicalRunId" INTEGER NOT NULL,
    "semanticRunId" INTEGER NOT NULL,
    "status" "HybridRetrievalRunStatus" NOT NULL,
    "fusionVersion" TEXT NOT NULL,
    "rrfK" INTEGER NOT NULL,
    "resultLimit" INTEGER NOT NULL,
    "datasetVersion" TEXT NOT NULL,
    "lexicalRetrievalVersion" TEXT NOT NULL,
    "semanticRetrievalVersion" TEXT NOT NULL,
    "retrievedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    CONSTRAINT "HybridRetrievalRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HybridRetrievalResult" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "runId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "rrfScore" FLOAT NOT NULL,
    "lexicalRank" INTEGER,
    "semanticRank" INTEGER,
    "fusionVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HybridRetrievalResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HybridRetrievalRun_id_companyId_key" ON "HybridRetrievalRun"("id", "companyId");
CREATE INDEX "HybridRetrievalRun_companyId_jobId_createdAt_idx" ON "HybridRetrievalRun"("companyId", "jobId", "createdAt");
CREATE UNIQUE INDEX "HybridRetrievalRun_completed_idempotency_key"
ON "HybridRetrievalRun" (
    "companyId",
    "lexicalRunId",
    "semanticRunId",
    "fusionVersion",
    "rrfK",
    "resultLimit",
    "datasetVersion"
)
WHERE "status" = 'COMPLETED';

CREATE INDEX "HybridRetrievalResult_companyId_runId_idx" ON "HybridRetrievalResult"("companyId", "runId");
CREATE INDEX "HybridRetrievalResult_companyId_applicationId_idx" ON "HybridRetrievalResult"("companyId", "applicationId");
CREATE INDEX "HybridRetrievalResult_companyId_candidateId_idx" ON "HybridRetrievalResult"("companyId", "candidateId");

ALTER TABLE "HybridRetrievalRun" ADD CONSTRAINT "HybridRetrievalRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HybridRetrievalRun" ADD CONSTRAINT "HybridRetrievalRun_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HybridRetrievalRun" ADD CONSTRAINT "HybridRetrievalRun_jobSpecificationVersionId_fkey" FOREIGN KEY ("jobSpecificationVersionId") REFERENCES "JobSpecificationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HybridRetrievalRun" ADD CONSTRAINT "HybridRetrievalRun_lexicalRunId_companyId_fkey" FOREIGN KEY ("lexicalRunId", "companyId") REFERENCES "LexicalRetrievalRun"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HybridRetrievalRun" ADD CONSTRAINT "HybridRetrievalRun_semanticRunId_companyId_fkey" FOREIGN KEY ("semanticRunId", "companyId") REFERENCES "SemanticRetrievalRun"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HybridRetrievalResult" ADD CONSTRAINT "HybridRetrievalResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HybridRetrievalResult" ADD CONSTRAINT "HybridRetrievalResult_runId_companyId_fkey" FOREIGN KEY ("runId", "companyId") REFERENCES "HybridRetrievalRun"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HybridRetrievalResult" ADD CONSTRAINT "HybridRetrievalResult_applicationId_companyId_fkey" FOREIGN KEY ("applicationId", "companyId") REFERENCES "Application"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HybridRetrievalResult" ADD CONSTRAINT "HybridRetrievalResult_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

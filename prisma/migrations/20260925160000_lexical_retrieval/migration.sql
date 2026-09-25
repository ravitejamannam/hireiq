-- Additive M8 lexical retrieval runs. Does not alter matching, ranking,
-- evidence, or application status semantics.

CREATE TYPE "LexicalRetrievalRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "LexicalRetrievalRun" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "jobSpecificationVersionId" INTEGER NOT NULL,
    "jobIntelligenceRunId" INTEGER NOT NULL,
    "status" "LexicalRetrievalRunStatus" NOT NULL,
    "retrievalVersion" TEXT NOT NULL,
    "queryConstructionVersion" TEXT NOT NULL,
    "normalizationVersion" TEXT NOT NULL,
    "ontologyVersion" TEXT NOT NULL,
    "resultLimit" INTEGER NOT NULL,
    "searchedCount" INTEGER NOT NULL DEFAULT 0,
    "retrievedCount" INTEGER NOT NULL DEFAULT 0,
    "queryHash" TEXT NOT NULL,
    "evidenceSnapshotHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    CONSTRAINT "LexicalRetrievalRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LexicalRetrievalResult" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "runId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "lexicalScore" INTEGER NOT NULL,
    "matchedTerms" TEXT[] NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LexicalRetrievalResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LexicalRetrievalRun_id_companyId_key" ON "LexicalRetrievalRun"("id", "companyId");
CREATE INDEX "LexicalRetrievalRun_companyId_jobId_createdAt_idx" ON "LexicalRetrievalRun"("companyId", "jobId", "createdAt");
CREATE INDEX "LexicalRetrievalRun_companyId_jobSpecificationVersionId_createdAt_idx" ON "LexicalRetrievalRun"("companyId", "jobSpecificationVersionId", "createdAt");
CREATE UNIQUE INDEX "LexicalRetrievalRun_completed_idempotency_key"
ON "LexicalRetrievalRun" (
    "companyId",
    "jobId",
    "jobSpecificationVersionId",
    "jobIntelligenceRunId",
    "retrievalVersion",
    "queryConstructionVersion",
    "normalizationVersion",
    "ontologyVersion",
    "resultLimit",
    "queryHash",
    "evidenceSnapshotHash"
)
WHERE "status" = 'COMPLETED';

CREATE INDEX "LexicalRetrievalResult_companyId_runId_idx" ON "LexicalRetrievalResult"("companyId", "runId");
CREATE INDEX "LexicalRetrievalResult_companyId_applicationId_idx" ON "LexicalRetrievalResult"("companyId", "applicationId");
CREATE INDEX "LexicalRetrievalResult_companyId_candidateId_idx" ON "LexicalRetrievalResult"("companyId", "candidateId");

ALTER TABLE "LexicalRetrievalRun" ADD CONSTRAINT "LexicalRetrievalRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LexicalRetrievalRun" ADD CONSTRAINT "LexicalRetrievalRun_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LexicalRetrievalRun" ADD CONSTRAINT "LexicalRetrievalRun_jobSpecificationVersionId_fkey" FOREIGN KEY ("jobSpecificationVersionId") REFERENCES "JobSpecificationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LexicalRetrievalRun" ADD CONSTRAINT "LexicalRetrievalRun_jobIntelligenceRunId_companyId_fkey" FOREIGN KEY ("jobIntelligenceRunId", "companyId") REFERENCES "JobIntelligenceRun"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LexicalRetrievalResult" ADD CONSTRAINT "LexicalRetrievalResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LexicalRetrievalResult" ADD CONSTRAINT "LexicalRetrievalResult_runId_companyId_fkey" FOREIGN KEY ("runId", "companyId") REFERENCES "LexicalRetrievalRun"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LexicalRetrievalResult" ADD CONSTRAINT "LexicalRetrievalResult_applicationId_companyId_fkey" FOREIGN KEY ("applicationId", "companyId") REFERENCES "Application"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LexicalRetrievalResult" ADD CONSTRAINT "LexicalRetrievalResult_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

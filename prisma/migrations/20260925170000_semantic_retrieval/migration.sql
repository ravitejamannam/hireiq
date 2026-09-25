-- Additive M9 semantic retrieval. Does not alter M8 lexical retrieval,
-- matching, ranking, evidence, or application status semantics.

CREATE TYPE "SemanticRetrievalRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "RetrievalEmbeddingSourceType" AS ENUM ('JOB_QUERY', 'EVIDENCE');

CREATE TABLE "RetrievalEmbedding" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "sourceType" "RetrievalEmbeddingSourceType" NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "normalizationVersion" TEXT NOT NULL,
    "vector" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RetrievalEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SemanticRetrievalRun" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "jobSpecificationVersionId" INTEGER NOT NULL,
    "jobIntelligenceRunId" INTEGER NOT NULL,
    "status" "SemanticRetrievalRunStatus" NOT NULL,
    "retrievalVersion" TEXT NOT NULL,
    "queryConstructionVersion" TEXT NOT NULL,
    "representationVersion" TEXT NOT NULL,
    "normalizationVersion" TEXT NOT NULL,
    "ontologyVersion" TEXT NOT NULL,
    "embeddingProvider" TEXT NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "embeddingModelVersion" TEXT NOT NULL,
    "embeddingDimensions" INTEGER NOT NULL,
    "resultLimit" INTEGER NOT NULL,
    "searchedCount" INTEGER NOT NULL DEFAULT 0,
    "retrievedCount" INTEGER NOT NULL DEFAULT 0,
    "queryHash" TEXT NOT NULL,
    "evidenceSnapshotHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    CONSTRAINT "SemanticRetrievalRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SemanticRetrievalResult" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "runId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "semanticScore" DOUBLE PRECISION NOT NULL,
    "supportingEvidenceId" INTEGER,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SemanticRetrievalResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetrievalEmbedding_identity_key" ON "RetrievalEmbedding"("companyId", "sourceType", "sourceId", "modelProvider", "modelName", "modelVersion", "normalizationVersion", "contentHash");
CREATE INDEX "RetrievalEmbedding_companyId_sourceType_sourceId_idx" ON "RetrievalEmbedding"("companyId", "sourceType", "sourceId");

CREATE UNIQUE INDEX "SemanticRetrievalRun_id_companyId_key" ON "SemanticRetrievalRun"("id", "companyId");
CREATE INDEX "SemanticRetrievalRun_companyId_jobId_createdAt_idx" ON "SemanticRetrievalRun"("companyId", "jobId", "createdAt");
CREATE INDEX "SemanticRetrievalRun_companyId_jobSpecificationVersionId_createdAt_idx" ON "SemanticRetrievalRun"("companyId", "jobSpecificationVersionId", "createdAt");
CREATE UNIQUE INDEX "SemanticRetrievalRun_completed_idempotency_key"
ON "SemanticRetrievalRun" (
    "companyId",
    "jobId",
    "jobSpecificationVersionId",
    "jobIntelligenceRunId",
    "retrievalVersion",
    "queryConstructionVersion",
    "representationVersion",
    "normalizationVersion",
    "ontologyVersion",
    "embeddingProvider",
    "embeddingModel",
    "embeddingModelVersion",
    "embeddingDimensions",
    "resultLimit",
    "queryHash",
    "evidenceSnapshotHash"
)
WHERE "status" = 'COMPLETED';

CREATE INDEX "SemanticRetrievalResult_companyId_runId_idx" ON "SemanticRetrievalResult"("companyId", "runId");
CREATE INDEX "SemanticRetrievalResult_companyId_applicationId_idx" ON "SemanticRetrievalResult"("companyId", "applicationId");
CREATE INDEX "SemanticRetrievalResult_companyId_candidateId_idx" ON "SemanticRetrievalResult"("companyId", "candidateId");
CREATE INDEX "SemanticRetrievalResult_companyId_supportingEvidenceId_idx" ON "SemanticRetrievalResult"("companyId", "supportingEvidenceId");

ALTER TABLE "RetrievalEmbedding" ADD CONSTRAINT "RetrievalEmbedding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SemanticRetrievalRun" ADD CONSTRAINT "SemanticRetrievalRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SemanticRetrievalRun" ADD CONSTRAINT "SemanticRetrievalRun_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SemanticRetrievalRun" ADD CONSTRAINT "SemanticRetrievalRun_jobSpecificationVersionId_fkey" FOREIGN KEY ("jobSpecificationVersionId") REFERENCES "JobSpecificationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SemanticRetrievalRun" ADD CONSTRAINT "SemanticRetrievalRun_jobIntelligenceRunId_companyId_fkey" FOREIGN KEY ("jobIntelligenceRunId", "companyId") REFERENCES "JobIntelligenceRun"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SemanticRetrievalResult" ADD CONSTRAINT "SemanticRetrievalResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SemanticRetrievalResult" ADD CONSTRAINT "SemanticRetrievalResult_runId_companyId_fkey" FOREIGN KEY ("runId", "companyId") REFERENCES "SemanticRetrievalRun"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SemanticRetrievalResult" ADD CONSTRAINT "SemanticRetrievalResult_applicationId_companyId_fkey" FOREIGN KEY ("applicationId", "companyId") REFERENCES "Application"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SemanticRetrievalResult" ADD CONSTRAINT "SemanticRetrievalResult_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SemanticRetrievalResult" ADD CONSTRAINT "SemanticRetrievalResult_supportingEvidenceId_companyId_fkey" FOREIGN KEY ("supportingEvidenceId", "companyId") REFERENCES "CandidateEvidence"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

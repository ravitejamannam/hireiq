-- Additive Phase 5 Candidate Evidence Graph V1.
-- Does not alter M8 lexical retrieval, M9 semantic retrieval, Matcher V2,
-- ranking, evidence eligibility, or application status semantics.

CREATE TYPE "EvidenceGraphRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "EvidenceGraphNodeType" AS ENUM ('EVIDENCE', 'CLAIM', 'REQUIREMENT', 'SKILL', 'ASSESSMENT');
CREATE TYPE "EvidenceGraphEdgeType" AS ENUM (
    'EVIDENCE_SUPPORTS_CLAIM',
    'CLAIM_MAPS_TO_SKILL',
    'REQUIREMENT_REQUIRES_SKILL',
    'CLAIM_CITED_FOR_REQUIREMENT',
    'ASSESSMENT_CITES_EVIDENCE',
    'ASSESSMENT_CITES_CLAIM'
);

CREATE TABLE "EvidenceGraphRun" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "jobSpecificationVersionId" INTEGER NOT NULL,
    "jobIntelligenceRunId" INTEGER,
    "matcherV2RunId" INTEGER,
    "status" "EvidenceGraphRunStatus" NOT NULL,
    "graphVersion" TEXT NOT NULL,
    "ontologyVersion" TEXT NOT NULL,
    "matcherVersion" TEXT,
    "sourceSnapshotHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    CONSTRAINT "EvidenceGraphRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceGraphEdge" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "runId" INTEGER NOT NULL,
    "edgeType" "EvidenceGraphEdgeType" NOT NULL,
    "fromType" "EvidenceGraphNodeType" NOT NULL,
    "fromId" INTEGER NOT NULL,
    "toType" "EvidenceGraphNodeType" NOT NULL,
    "toId" INTEGER NOT NULL,
    "provenance" TEXT NOT NULL,
    "sourceEvidenceId" INTEGER,
    "sourceClaimId" INTEGER,
    "sourceRequirementId" INTEGER,
    "sourceAssessmentId" INTEGER,
    "ontologyVersion" TEXT,
    "jobSpecificationVersionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceGraphEdge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvidenceGraphRun_id_companyId_key" ON "EvidenceGraphRun"("id", "companyId");
CREATE INDEX "EvidenceGraphRun_companyId_applicationId_createdAt_idx" ON "EvidenceGraphRun"("companyId", "applicationId", "createdAt");
CREATE INDEX "EvidenceGraphRun_companyId_jobId_createdAt_idx" ON "EvidenceGraphRun"("companyId", "jobId", "createdAt");
CREATE UNIQUE INDEX "EvidenceGraphRun_completed_idempotency_key"
ON "EvidenceGraphRun" (
    "companyId",
    "applicationId",
    "jobSpecificationVersionId",
    COALESCE("jobIntelligenceRunId", 0),
    COALESCE("matcherV2RunId", 0),
    "graphVersion",
    "ontologyVersion",
    COALESCE("matcherVersion", ''),
    "sourceSnapshotHash"
)
WHERE "status" = 'COMPLETED';

CREATE UNIQUE INDEX "EvidenceGraphEdge_identity_key" ON "EvidenceGraphEdge"("companyId", "runId", "edgeType", "fromType", "fromId", "toType", "toId");
CREATE INDEX "EvidenceGraphEdge_companyId_runId_idx" ON "EvidenceGraphEdge"("companyId", "runId");
CREATE INDEX "EvidenceGraphEdge_companyId_fromType_fromId_idx" ON "EvidenceGraphEdge"("companyId", "fromType", "fromId");
CREATE INDEX "EvidenceGraphEdge_companyId_toType_toId_idx" ON "EvidenceGraphEdge"("companyId", "toType", "toId");

ALTER TABLE "EvidenceGraphRun" ADD CONSTRAINT "EvidenceGraphRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvidenceGraphRun" ADD CONSTRAINT "EvidenceGraphRun_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvidenceGraphRun" ADD CONSTRAINT "EvidenceGraphRun_applicationId_companyId_fkey" FOREIGN KEY ("applicationId", "companyId") REFERENCES "Application"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvidenceGraphRun" ADD CONSTRAINT "EvidenceGraphRun_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvidenceGraphRun" ADD CONSTRAINT "EvidenceGraphRun_jobSpecificationVersionId_fkey" FOREIGN KEY ("jobSpecificationVersionId") REFERENCES "JobSpecificationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EvidenceGraphEdge" ADD CONSTRAINT "EvidenceGraphEdge_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvidenceGraphEdge" ADD CONSTRAINT "EvidenceGraphEdge_runId_companyId_fkey" FOREIGN KEY ("runId", "companyId") REFERENCES "EvidenceGraphRun"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

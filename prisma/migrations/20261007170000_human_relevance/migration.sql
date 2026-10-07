-- Additive M12 human relevance judgments. Does not alter retrieval, matching, or application status.

CREATE TYPE "HumanRelevanceLabel" AS ENUM ('RELEVANT', 'NOT_RELEVANT');

CREATE TABLE "HumanRelevanceJudgment" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "jobSpecificationVersionId" INTEGER NOT NULL,
    "reviewerUserId" INTEGER NOT NULL,
    "protocolVersion" TEXT NOT NULL,
    "label" "HumanRelevanceLabel" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "supersededById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HumanRelevanceJudgment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HumanRelevanceJudgmentEvidence" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "judgmentId" INTEGER NOT NULL,
    "evidenceId" INTEGER NOT NULL,
    "contentSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HumanRelevanceJudgmentEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HumanRelevanceJudgment_idempotencyKey_key" ON "HumanRelevanceJudgment"("idempotencyKey");
CREATE UNIQUE INDEX "HumanRelevanceJudgment_id_companyId_key" ON "HumanRelevanceJudgment"("id", "companyId");
CREATE INDEX "HumanRelevanceJudgment_companyId_applicationId_createdAt_idx" ON "HumanRelevanceJudgment"("companyId", "applicationId", "createdAt");
CREATE INDEX "HumanRelevanceJudgment_companyId_jobId_createdAt_idx" ON "HumanRelevanceJudgment"("companyId", "jobId", "createdAt");
CREATE INDEX "HumanRelevanceJudgment_supersededById_idx" ON "HumanRelevanceJudgment"("supersededById");
CREATE INDEX "HumanRelevanceJudgmentEvidence_companyId_judgmentId_idx" ON "HumanRelevanceJudgmentEvidence"("companyId", "judgmentId");
CREATE INDEX "HumanRelevanceJudgmentEvidence_companyId_evidenceId_idx" ON "HumanRelevanceJudgmentEvidence"("companyId", "evidenceId");

ALTER TABLE "HumanRelevanceJudgment" ADD CONSTRAINT "HumanRelevanceJudgment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HumanRelevanceJudgment" ADD CONSTRAINT "HumanRelevanceJudgment_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HumanRelevanceJudgment" ADD CONSTRAINT "HumanRelevanceJudgment_applicationId_companyId_fkey" FOREIGN KEY ("applicationId", "companyId") REFERENCES "Application"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HumanRelevanceJudgment" ADD CONSTRAINT "HumanRelevanceJudgment_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HumanRelevanceJudgment" ADD CONSTRAINT "HumanRelevanceJudgment_jobSpecificationVersionId_fkey" FOREIGN KEY ("jobSpecificationVersionId") REFERENCES "JobSpecificationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HumanRelevanceJudgment" ADD CONSTRAINT "HumanRelevanceJudgment_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HumanRelevanceJudgment" ADD CONSTRAINT "HumanRelevanceJudgment_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "HumanRelevanceJudgment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HumanRelevanceJudgmentEvidence" ADD CONSTRAINT "HumanRelevanceJudgmentEvidence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HumanRelevanceJudgmentEvidence" ADD CONSTRAINT "HumanRelevanceJudgmentEvidence_judgmentId_companyId_fkey" FOREIGN KEY ("judgmentId", "companyId") REFERENCES "HumanRelevanceJudgment"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HumanRelevanceJudgmentEvidence" ADD CONSTRAINT "HumanRelevanceJudgmentEvidence_evidenceId_companyId_fkey" FOREIGN KEY ("evidenceId", "companyId") REFERENCES "CandidateEvidence"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

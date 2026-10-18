-- Self-identification is deliberately not a foreign key of Application, Evaluation, or match tables.
CREATE TABLE IF NOT EXISTS "CandidateSelfIdentification" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "candidateId" INTEGER NOT NULL,
  "consentedAt" TIMESTAMP(3) NOT NULL,
  "gender" TEXT NOT NULL DEFAULT 'prefer_not',
  "ageBand" TEXT NOT NULL DEFAULT 'prefer_not',
  "disability" TEXT NOT NULL DEFAULT 'prefer_not',
  "region" TEXT NOT NULL DEFAULT 'prefer_not',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CandidateSelfIdentification_candidateId_key" ON "CandidateSelfIdentification"("candidateId");
CREATE INDEX IF NOT EXISTS "CandidateSelfIdentification_companyId_idx" ON "CandidateSelfIdentification"("companyId");

CREATE TABLE IF NOT EXISTS "FairnessSnapshot" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "jobId" INTEGER,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "report" JSONB NOT NULL,
  CONSTRAINT "FairnessSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "FairnessSnapshot_companyId_computedAt_idx" ON "FairnessSnapshot"("companyId", "computedAt");

CREATE TABLE IF NOT EXISTS "FairnessReview" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "jobId" INTEGER NOT NULL,
  "requirementKey" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "actorUserId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FairnessReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "FairnessReview_companyId_jobId_idx" ON "FairnessReview"("companyId", "jobId");

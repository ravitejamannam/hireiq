ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "futureRolesConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "rediscoveryRejectDays" INTEGER NOT NULL DEFAULT 90;

CREATE TABLE IF NOT EXISTS "TalentRediscoveryRun" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "jobId" INTEGER NOT NULL,
  "specificationVersionId" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "results" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "TalentRediscoveryRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT,
  CONSTRAINT "TalentRediscoveryRun_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "TalentRediscoveryRun_jobId_specificationVersionId_key" ON "TalentRediscoveryRun"("jobId", "specificationVersionId");
CREATE INDEX IF NOT EXISTS "TalentRediscoveryRun_companyId_jobId_idx" ON "TalentRediscoveryRun"("companyId", "jobId");

CREATE TABLE IF NOT EXISTS "TalentRediscoveryAction" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "jobId" INTEGER NOT NULL,
  "candidateId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TalentRediscoveryAction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT,
  CONSTRAINT "TalentRediscoveryAction_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "TalentRediscoveryAction_jobId_candidateId_kind_key" ON "TalentRediscoveryAction"("jobId", "candidateId", "kind");

CREATE TABLE IF NOT EXISTS "TalentRediscoveryInvite" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "jobId" INTEGER NOT NULL,
  "candidateId" INTEGER NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TalentRediscoveryInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT,
  CONSTRAINT "TalentRediscoveryInvite_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "TalentRediscoveryInvite_tokenHash_key" ON "TalentRediscoveryInvite"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "TalentRediscoveryInvite_jobId_candidateId_key" ON "TalentRediscoveryInvite"("jobId", "candidateId");

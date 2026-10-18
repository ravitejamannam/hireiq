ALTER TABLE "GeneratedAssessmentInvite" ADD COLUMN IF NOT EXISTS "handoffTokenHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "GeneratedAssessmentInvite_handoffTokenHash_key" ON "GeneratedAssessmentInvite"("handoffTokenHash");

ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "withdrawnAt" TIMESTAMP(3);
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "withdrawReason" TEXT;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "emailUnsubscribedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "PortalLoginLink" (
  "id" SERIAL PRIMARY KEY,
  "emailNormalized" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PortalLoginLink_tokenHash_key" ON "PortalLoginLink"("tokenHash");
CREATE INDEX IF NOT EXISTS "PortalLoginLink_emailNormalized_createdAt_idx" ON "PortalLoginLink"("emailNormalized", "createdAt");

CREATE TABLE IF NOT EXISTS "CandidatePortalIdentity" (
  "id" SERIAL PRIMARY KEY,
  "emailNormalized" TEXT NOT NULL,
  "candidateId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidatePortalIdentity_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT,
  CONSTRAINT "CandidatePortalIdentity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "CandidatePortalIdentity_emailNormalized_candidateId_key" ON "CandidatePortalIdentity"("emailNormalized", "candidateId");
CREATE INDEX IF NOT EXISTS "CandidatePortalIdentity_emailNormalized_idx" ON "CandidatePortalIdentity"("emailNormalized");

CREATE TABLE IF NOT EXISTS "CandidatePortalDocument" (
  "id" SERIAL PRIMARY KEY,
  "applicationId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "candidateId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "parseStatus" TEXT NOT NULL,
  "parseMessage" TEXT,
  "replacedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidatePortalDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT,
  CONSTRAINT "CandidatePortalDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "CandidatePortalDocument_applicationId_replacedAt_idx" ON "CandidatePortalDocument"("applicationId", "replacedAt");

CREATE TABLE IF NOT EXISTS "CandidateDeletionRequest" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "candidateId" INTEGER NOT NULL,
  "applicationId" INTEGER,
  "emailNormalized" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateDeletionRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT,
  CONSTRAINT "CandidateDeletionRequest_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT,
  CONSTRAINT "CandidateDeletionRequest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "CandidateDeletionRequest_status_createdAt_idx" ON "CandidateDeletionRequest"("status", "createdAt");

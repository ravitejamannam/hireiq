-- T91: append-only CandidateEvidence artifacts.
-- Additive. Does not alter Candidate, CandidateProfile, identity,
-- Application pipeline, Application.source, ingestion, or JWT.
-- Does not store files, claims, observations, AI, scores, or CompanyPerson.

-- CreateEnum
CREATE TYPE "CandidateEvidenceSourceType" AS ENUM ('HOSTED_APPLY_SUBMISSION');

-- CreateEnum
CREATE TYPE "CandidateEvidenceOrigin" AS ENUM ('CANDIDATE_PROVIDED', 'PROVIDER_PROVIDED', 'RECRUITER_ENTERED', 'SYSTEM_RECORDED');

-- Tenant-safe composite unique for evidence → Application FK (additive).
CREATE UNIQUE INDEX "Application_id_companyId_key" ON "Application"("id", "companyId");

-- CreateTable
CREATE TABLE "CandidateEvidence" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "applicationId" INTEGER,
    "sourceType" "CandidateEvidenceSourceType" NOT NULL,
    "origin" "CandidateEvidenceOrigin" NOT NULL,
    "ingestionEventId" INTEGER,
    "hostedApplySubmissionId" INTEGER,
    "actorUserId" INTEGER,
    "inlineText" TEXT,
    "contentSha256" TEXT,
    "supersededById" INTEGER,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateEvidence_hostedApplySubmissionId_key" ON "CandidateEvidence"("hostedApplySubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateEvidence_id_companyId_key" ON "CandidateEvidence"("id", "companyId");

-- CreateIndex
CREATE INDEX "CandidateEvidence_companyId_candidateId_createdAt_idx" ON "CandidateEvidence"("companyId", "candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "CandidateEvidence_companyId_applicationId_idx" ON "CandidateEvidence"("companyId", "applicationId");

-- CreateIndex
CREATE INDEX "CandidateEvidence_supersededById_idx" ON "CandidateEvidence"("supersededById");

-- AddForeignKey
ALTER TABLE "CandidateEvidence" ADD CONSTRAINT "CandidateEvidence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateEvidence" ADD CONSTRAINT "CandidateEvidence_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateEvidence" ADD CONSTRAINT "CandidateEvidence_applicationId_companyId_fkey" FOREIGN KEY ("applicationId", "companyId") REFERENCES "Application"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateEvidence" ADD CONSTRAINT "CandidateEvidence_ingestionEventId_companyId_fkey" FOREIGN KEY ("ingestionEventId", "companyId") REFERENCES "ApplicationIngestionEvent"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateEvidence" ADD CONSTRAINT "CandidateEvidence_hostedApplySubmissionId_companyId_fkey" FOREIGN KEY ("hostedApplySubmissionId", "companyId") REFERENCES "HostedApplySubmission"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateEvidence" ADD CONSTRAINT "CandidateEvidence_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CandidateEvidence" ADD CONSTRAINT "CandidateEvidence_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "CandidateEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hosted-apply cover-letter backfill is performed by the T91 evidence service
-- so SHA-256 can use the existing Node crypto convention (UTF-8 digest).
-- Uniqueness on hostedApplySubmissionId makes that backfill idempotent.
-- Do not invent resumes, LinkedIn/Indeed/Naukri documents, or profile snapshots.

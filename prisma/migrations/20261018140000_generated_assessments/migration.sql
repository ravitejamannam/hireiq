CREATE TYPE "GeneratedAssessmentStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "GeneratedAssessment" (
  "id" SERIAL NOT NULL,
  "jobId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "GeneratedAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
  "timeLimitMinutes" INTEGER NOT NULL DEFAULT 45,
  "items" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GeneratedAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneratedAssessmentInvite" (
  "id" SERIAL NOT NULL,
  "applicationId" INTEGER NOT NULL,
  "assessmentId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "itemOrder" JSONB NOT NULL,
  "answers" JSONB NOT NULL DEFAULT '{}',
  "integrity" JSONB,
  "extraTimeRequested" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "grades" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GeneratedAssessmentInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GeneratedAssessment_jobId_version_key" ON "GeneratedAssessment"("jobId", "version");
CREATE INDEX "GeneratedAssessment_jobId_status_idx" ON "GeneratedAssessment"("jobId", "status");
CREATE UNIQUE INDEX "GeneratedAssessmentInvite_tokenHash_key" ON "GeneratedAssessmentInvite"("tokenHash");
CREATE INDEX "GeneratedAssessmentInvite_applicationId_idx" ON "GeneratedAssessmentInvite"("applicationId");
CREATE INDEX "GeneratedAssessmentInvite_expiresAt_idx" ON "GeneratedAssessmentInvite"("expiresAt");

ALTER TABLE "GeneratedAssessment" ADD CONSTRAINT "GeneratedAssessment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeneratedAssessment" ADD CONSTRAINT "GeneratedAssessment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeneratedAssessmentInvite" ADD CONSTRAINT "GeneratedAssessmentInvite_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "GeneratedAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

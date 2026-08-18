-- T85: Application ingestion gateway. Additive.
-- Does not alter Application unique constraint, SourcingDatabaseSource,
-- RequirementLifecycle, Candidate identity, or JWT.

-- CreateEnum
CREATE TYPE "ApplicationIngestionChannel" AS ENUM ('HOSTED_APPLY', 'LINKEDIN', 'INDEED', 'NAUKRI', 'REFERRAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "ApplicationIngestionStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "ApplicationIngestionEvent" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "applicationId" INTEGER,
    "candidateId" INTEGER,
    "sourceChannel" "ApplicationIngestionChannel" NOT NULL,
    "distributionId" INTEGER,
    "providerPostingId" INTEGER,
    "hostedApplySubmissionId" INTEGER,
    "externalApplicationId" TEXT,
    "externalCandidateId" TEXT,
    "jobSpecificationVersionId" INTEGER NOT NULL,
    "status" "ApplicationIngestionStatus" NOT NULL DEFAULT 'RECEIVED',
    "applicantName" TEXT NOT NULL,
    "applicantEmailNormalized" TEXT,
    "applicantPhone" TEXT,
    "applicantLocation" TEXT,
    "applicantExperienceYears" INTEGER,
    "applicantLinkedInUrl" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationIngestionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationIngestionEvent_hostedApplySubmissionId_key" ON "ApplicationIngestionEvent"("hostedApplySubmissionId");

-- CreateIndex
CREATE INDEX "ApplicationIngestionEvent_companyId_idx" ON "ApplicationIngestionEvent"("companyId");

-- CreateIndex
CREATE INDEX "ApplicationIngestionEvent_jobId_idx" ON "ApplicationIngestionEvent"("jobId");

-- CreateIndex
CREATE INDEX "ApplicationIngestionEvent_status_idx" ON "ApplicationIngestionEvent"("status");

-- CreateIndex
CREATE INDEX "ApplicationIngestionEvent_sourceChannel_idx" ON "ApplicationIngestionEvent"("sourceChannel");

-- CreateIndex
CREATE INDEX "ApplicationIngestionEvent_createdAt_idx" ON "ApplicationIngestionEvent"("createdAt");

-- Future provider idempotency. Multiple NULLs are allowed.
CREATE UNIQUE INDEX "ApplicationIngestionEvent_channel_external_application_key"
ON "ApplicationIngestionEvent" ("sourceChannel", "externalApplicationId")
WHERE "externalApplicationId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "ApplicationIngestionEvent" ADD CONSTRAINT "ApplicationIngestionEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationIngestionEvent" ADD CONSTRAINT "ApplicationIngestionEvent_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationIngestionEvent" ADD CONSTRAINT "ApplicationIngestionEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationIngestionEvent" ADD CONSTRAINT "ApplicationIngestionEvent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationIngestionEvent" ADD CONSTRAINT "ApplicationIngestionEvent_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "JobDistribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationIngestionEvent" ADD CONSTRAINT "ApplicationIngestionEvent_providerPostingId_fkey" FOREIGN KEY ("providerPostingId") REFERENCES "ProviderPosting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationIngestionEvent" ADD CONSTRAINT "ApplicationIngestionEvent_hostedApplySubmissionId_fkey" FOREIGN KEY ("hostedApplySubmissionId") REFERENCES "HostedApplySubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationIngestionEvent" ADD CONSTRAINT "ApplicationIngestionEvent_jobSpecificationVersionId_fkey" FOREIGN KEY ("jobSpecificationVersionId") REFERENCES "JobSpecificationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

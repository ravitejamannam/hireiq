-- T84: HireIQ hosted public apply. Additive.
-- Does not alter RequirementLifecycle, SourcingDatabaseSource,
-- Application, Candidate, Job specification columns, or JWT.

-- CreateEnum
CREATE TYPE "HostedApplySubmissionStatus" AS ENUM ('RECEIVED');

-- CreateTable
CREATE TABLE "ApplyToken" (
    "id" SERIAL NOT NULL,
    "distributionId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApplyToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostedApplySubmission" (
    "id" SERIAL NOT NULL,
    "applyTokenId" INTEGER NOT NULL,
    "distributionId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "jobSpecificationVersionId" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT,
    "experienceYears" INTEGER,
    "linkedInUrl" TEXT,
    "coverLetter" TEXT,
    "consentAcceptedAt" TIMESTAMP(3) NOT NULL,
    "status" "HostedApplySubmissionStatus" NOT NULL DEFAULT 'RECEIVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostedApplySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApplyToken_tokenHash_key" ON "ApplyToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApplyToken_distributionId_idx" ON "ApplyToken"("distributionId");

-- At most one live (non-revoked) token per distribution
CREATE UNIQUE INDEX "ApplyToken_one_live_per_distribution"
ON "ApplyToken" ("distributionId")
WHERE "revokedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "HostedApplySubmission_idempotencyKey_key" ON "HostedApplySubmission"("idempotencyKey");

-- T84 anti-duplicate only. Not Candidate identity.
CREATE UNIQUE INDEX "HostedApplySubmission_distributionId_emailNormalized_key" ON "HostedApplySubmission"("distributionId", "emailNormalized");

-- CreateIndex
CREATE INDEX "HostedApplySubmission_applyTokenId_idx" ON "HostedApplySubmission"("applyTokenId");

-- CreateIndex
CREATE INDEX "HostedApplySubmission_distributionId_idx" ON "HostedApplySubmission"("distributionId");

-- CreateIndex
CREATE INDEX "HostedApplySubmission_jobId_idx" ON "HostedApplySubmission"("jobId");

-- CreateIndex
CREATE INDEX "HostedApplySubmission_createdAt_idx" ON "HostedApplySubmission"("createdAt");

-- AddForeignKey
ALTER TABLE "ApplyToken" ADD CONSTRAINT "ApplyToken_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "JobDistribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostedApplySubmission" ADD CONSTRAINT "HostedApplySubmission_applyTokenId_fkey" FOREIGN KEY ("applyTokenId") REFERENCES "ApplyToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostedApplySubmission" ADD CONSTRAINT "HostedApplySubmission_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "JobDistribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostedApplySubmission" ADD CONSTRAINT "HostedApplySubmission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostedApplySubmission" ADD CONSTRAINT "HostedApplySubmission_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostedApplySubmission" ADD CONSTRAINT "HostedApplySubmission_jobSpecificationVersionId_fkey" FOREIGN KEY ("jobSpecificationVersionId") REFERENCES "JobSpecificationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

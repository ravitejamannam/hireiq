-- T83: provider-neutral job distribution foundation. Additive.
-- Does not alter RequirementLifecycle, SourcingDatabaseSource,
-- Application.source, Job specification columns, or JWT.

-- CreateEnum
CREATE TYPE "DistributionProvider" AS ENUM ('LINKEDIN', 'INDEED', 'NAUKRI', 'MANUAL');

-- CreateEnum
CREATE TYPE "ProviderConnectionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "JobDistributionStatus" AS ENUM ('DISABLED', 'READY', 'PUBLISHING', 'PUBLISHED', 'PAUSED', 'CLOSING', 'CLOSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProviderPostingStatus" AS ENUM ('UNKNOWN', 'LIVE', 'PAUSED', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DistributionAttemptStatus" AS ENUM ('IN_FLIGHT', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT');

-- CreateEnum
CREATE TYPE "DistributionAttemptOperation" AS ENUM ('CREATE', 'UPDATE', 'CLOSE', 'PAUSE', 'RESUME', 'FETCH');

-- CreateEnum
CREATE TYPE "ApplyMode" AS ENUM ('PROVIDER_NATIVE', 'EXTERNAL_URL', 'HIREIQ_HOSTED');

-- CreateTable
CREATE TABLE "ProviderConnection" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "provider" "DistributionProvider" NOT NULL,
    "status" "ProviderConnectionStatus" NOT NULL DEFAULT 'INACTIVE',
    "providerAccountId" TEXT,
    "credentialCiphertext" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobDistribution" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "jobSpecificationVersionId" INTEGER NOT NULL,
    "provider" "DistributionProvider" NOT NULL,
    "providerConnectionId" INTEGER,
    "status" "JobDistributionStatus" NOT NULL DEFAULT 'READY',
    "applyMode" "ApplyMode" NOT NULL,
    "applyUrlSnapshot" TEXT,
    "includeCompensation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderPosting" (
    "id" SERIAL NOT NULL,
    "distributionId" INTEGER NOT NULL,
    "provider" "DistributionProvider" NOT NULL,
    "externalPostingId" TEXT,
    "externalUrl" TEXT,
    "providerStatus" "ProviderPostingStatus" NOT NULL DEFAULT 'UNKNOWN',
    "providerCreatedAt" TIMESTAMP(3),
    "providerUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionAttempt" (
    "id" SERIAL NOT NULL,
    "distributionId" INTEGER NOT NULL,
    "operation" "DistributionAttemptOperation" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT,
    "status" "DistributionAttemptStatus" NOT NULL,
    "normalizedError" JSONB,
    "sanitizedResponse" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConnection_companyId_provider_key" ON "ProviderConnection"("companyId", "provider");

-- CreateIndex
CREATE INDEX "ProviderConnection_companyId_status_idx" ON "ProviderConnection"("companyId", "status");

-- CreateIndex
CREATE INDEX "JobDistribution_companyId_idx" ON "JobDistribution"("companyId");

-- CreateIndex
CREATE INDEX "JobDistribution_jobId_provider_idx" ON "JobDistribution"("jobId", "provider");

-- CreateIndex
CREATE INDEX "JobDistribution_jobSpecificationVersionId_idx" ON "JobDistribution"("jobSpecificationVersionId");

-- CreateIndex
CREATE INDEX "JobDistribution_status_idx" ON "JobDistribution"("status");

-- At most one non-CLOSED distribution per job + provider
CREATE UNIQUE INDEX "JobDistribution_one_non_closed_per_job_provider"
ON "JobDistribution" ("jobId", "provider")
WHERE "status" <> 'CLOSED';

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPosting_distributionId_key" ON "ProviderPosting"("distributionId");

-- CreateIndex
CREATE INDEX "ProviderPosting_provider_externalPostingId_idx" ON "ProviderPosting"("provider", "externalPostingId");

-- Unique external posting identity when the provider returned an id
CREATE UNIQUE INDEX "ProviderPosting_provider_externalPostingId_key"
ON "ProviderPosting" ("provider", "externalPostingId")
WHERE "externalPostingId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "DistributionAttempt_idempotencyKey_key" ON "DistributionAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DistributionAttempt_distributionId_createdAt_idx" ON "DistributionAttempt"("distributionId", "createdAt");

-- CreateIndex
CREATE INDEX "DistributionAttempt_status_idx" ON "DistributionAttempt"("status");

-- AddForeignKey
ALTER TABLE "ProviderConnection" ADD CONSTRAINT "ProviderConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDistribution" ADD CONSTRAINT "JobDistribution_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDistribution" ADD CONSTRAINT "JobDistribution_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDistribution" ADD CONSTRAINT "JobDistribution_jobSpecificationVersionId_fkey" FOREIGN KEY ("jobSpecificationVersionId") REFERENCES "JobSpecificationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDistribution" ADD CONSTRAINT "JobDistribution_providerConnectionId_fkey" FOREIGN KEY ("providerConnectionId") REFERENCES "ProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPosting" ADD CONSTRAINT "ProviderPosting_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "JobDistribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionAttempt" ADD CONSTRAINT "DistributionAttempt_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "JobDistribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

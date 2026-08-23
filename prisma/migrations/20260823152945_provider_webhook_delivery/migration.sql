-- CreateEnum
CREATE TYPE "ProviderWebhookDeliveryStatus" AS ENUM ('ACCEPTED', 'QUARANTINED', 'REJECTED');

-- CreateTable
CREATE TABLE "ProviderWebhookDelivery" (
    "id" SERIAL NOT NULL,
    "provider" "DistributionProvider" NOT NULL,
    "externalEventId" TEXT,
    "status" "ProviderWebhookDeliveryStatus" NOT NULL,
    "httpStatus" INTEGER NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "payloadRaw" TEXT,
    "payloadSha256" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ProviderWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderWebhookDelivery_provider_status_receivedAt_idx" ON "ProviderWebhookDelivery"("provider", "status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderWebhookDelivery_provider_externalEventId_key" ON "ProviderWebhookDelivery"("provider", "externalEventId");

-- RenameIndex
ALTER INDEX "CandidateIdentitySignal_companyId_candidateId_kind_normalizedVa" RENAME TO "CandidateIdentitySignal_companyId_candidateId_kind_normaliz_key";

-- RenameIndex
ALTER INDEX "CandidateMatchRun_companyId_jobSpecificationVersionId_createdAt" RENAME TO "CandidateMatchRun_companyId_jobSpecificationVersionId_creat_idx";

-- Company-scoped public feeds (off by default) and Google Indexing API attempt log.
-- Additive. Does not change JobDistribution publication state.

ALTER TABLE "Company" ADD COLUMN "jobsFeedEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN "linkedInFeedEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN "linkedInCompanyId" TEXT;
ALTER TABLE "Company" ADD COLUMN "linkedInPosterEmail" TEXT;

CREATE TYPE "IndexingNotificationType" AS ENUM ('URL_UPDATED', 'URL_DELETED');
CREATE TYPE "IndexingNotificationStatus" AS ENUM ('PENDING', 'SUBMITTED', 'FAILED', 'UNCONFIGURED');

CREATE TABLE "IndexingNotification" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "distributionId" INTEGER NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "notificationType" "IndexingNotificationType" NOT NULL,
    "status" "IndexingNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "httpStatus" INTEGER,
    "errorCode" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IndexingNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IndexingNotification_distributionId_notificationType_key" ON "IndexingNotification"("distributionId", "notificationType");
CREATE INDEX "IndexingNotification_companyId_distributionId_idx" ON "IndexingNotification"("companyId", "distributionId");
CREATE INDEX "IndexingNotification_status_nextAttemptAt_idx" ON "IndexingNotification"("status", "nextAttemptAt");

ALTER TABLE "IndexingNotification" ADD CONSTRAINT "IndexingNotification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndexingNotification" ADD CONSTRAINT "IndexingNotification_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "JobDistribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additive only. No existing column, row, or constraint is changed or dropped.

ALTER TABLE "Application" ADD COLUMN "knockoutFailedAt" TIMESTAMP(3);

-- Earlier knockout handling closed the application automatically. Keep the
-- record of the failed answer; the status those rows already have is left alone.
UPDATE "Application" SET "knockoutFailedAt" = "updatedAt"
  WHERE "rejectionReasonCode" = 'KNOCKOUT' AND "knockoutFailedAt" IS NULL;

CREATE TABLE "CloseOutBatch" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "applicationIds" JSONB NOT NULL,
    "proposedByUserId" INTEGER NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedByUserId" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "result" JSONB,

    CONSTRAINT "CloseOutBatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CloseOutBatch_approval_pair" CHECK (("approvedAt" IS NULL) = ("approvedByUserId" IS NULL)),
    CONSTRAINT "CloseOutBatch_single_outcome" CHECK ("approvedAt" IS NULL OR "cancelledAt" IS NULL)
);

CREATE TABLE "SpotCheck" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "sourceCategory" TEXT NOT NULL,
    "reviewedByUserId" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpotCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CloseOutBatch_companyId_jobId_proposedAt_idx" ON "CloseOutBatch"("companyId", "jobId", "proposedAt");
CREATE UNIQUE INDEX "SpotCheck_jobId_weekStart_applicationId_key" ON "SpotCheck"("jobId", "weekStart", "applicationId");
CREATE INDEX "SpotCheck_companyId_jobId_weekStart_idx" ON "SpotCheck"("companyId", "jobId", "weekStart");

ALTER TABLE "CloseOutBatch" ADD CONSTRAINT "CloseOutBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CloseOutBatch" ADD CONSTRAINT "CloseOutBatch_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpotCheck" ADD CONSTRAINT "SpotCheck_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpotCheck" ADD CONSTRAINT "SpotCheck_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpotCheck" ADD CONSTRAINT "SpotCheck_applicationId_companyId_fkey" FOREIGN KEY ("applicationId", "companyId") REFERENCES "Application"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Applicant spreadsheet import batches. Does not alter Candidate, Application, or Audit columns.

CREATE TYPE "ApplicantImportStatus" AS ENUM ('CONFIRMED', 'COMPLETED', 'PARTIAL', 'FAILED');
CREATE TYPE "ApplicantImportRowStatus" AS ENUM ('CREATED', 'ATTACHED', 'SKIPPED', 'FAILED');

CREATE TABLE "ApplicantImportTemplate" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApplicantImportTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApplicantImportTemplate_companyId_name_key" ON "ApplicantImportTemplate"("companyId", "name");
CREATE INDEX "ApplicantImportTemplate_companyId_idx" ON "ApplicantImportTemplate"("companyId");
ALTER TABLE "ApplicantImportTemplate" ADD CONSTRAINT "ApplicantImportTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ApplicantImportBatch" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "createdByUserId" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ApplicantImportStatus" NOT NULL DEFAULT 'CONFIRMED',
    "mapping" JSONB NOT NULL,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "attachedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ApplicantImportBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApplicantImportBatch_companyId_idempotencyKey_key" ON "ApplicantImportBatch"("companyId", "idempotencyKey");
CREATE INDEX "ApplicantImportBatch_companyId_jobId_idx" ON "ApplicantImportBatch"("companyId", "jobId");
ALTER TABLE "ApplicantImportBatch" ADD CONSTRAINT "ApplicantImportBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApplicantImportBatch" ADD CONSTRAINT "ApplicantImportBatch_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ApplicantImportRow" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" "ApplicantImportRowStatus" NOT NULL,
    "candidateId" INTEGER,
    "applicationId" INTEGER,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailMasked" TEXT,
    "externalCandidateId" TEXT,
    CONSTRAINT "ApplicantImportRow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApplicantImportRow_batchId_rowNumber_key" ON "ApplicantImportRow"("batchId", "rowNumber");
CREATE INDEX "ApplicantImportRow_companyId_idx" ON "ApplicantImportRow"("companyId");
ALTER TABLE "ApplicantImportRow" ADD CONSTRAINT "ApplicantImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ApplicantImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

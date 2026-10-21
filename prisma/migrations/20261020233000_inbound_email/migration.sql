-- Job-specific inbound email routes and message outcomes.
-- Does not store raw message bodies, resume text, or routing tokens in the clear.
-- Does not alter Candidate, Application, or Audit columns.

CREATE TYPE "InboundEmailStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'REVIEW', 'FAILED', 'REJECTED');

CREATE TABLE "InboundEmailRoute" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenCiphertext" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InboundEmailRoute_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InboundEmailRoute_tokenHash_key" ON "InboundEmailRoute"("tokenHash");
CREATE UNIQUE INDEX "InboundEmailRoute_companyId_jobId_key" ON "InboundEmailRoute"("companyId", "jobId");
CREATE INDEX "InboundEmailRoute_companyId_idx" ON "InboundEmailRoute"("companyId");
ALTER TABLE "InboundEmailRoute" ADD CONSTRAINT "InboundEmailRoute_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InboundEmailRoute" ADD CONSTRAINT "InboundEmailRoute_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InboundEmailMessage" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "routeId" INTEGER NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "status" "InboundEmailStatus" NOT NULL DEFAULT 'RECEIVED',
    "code" TEXT,
    "applicantName" TEXT,
    "emailMasked" TEXT,
    "attachmentCount" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT,
    "applicationId" INTEGER,
    "candidateId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InboundEmailMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InboundEmailMessage_providerEventId_key" ON "InboundEmailMessage"("providerEventId");
CREATE INDEX "InboundEmailMessage_companyId_jobId_idx" ON "InboundEmailMessage"("companyId", "jobId");
CREATE INDEX "InboundEmailMessage_status_updatedAt_idx" ON "InboundEmailMessage"("status", "updatedAt");
ALTER TABLE "InboundEmailMessage" ADD CONSTRAINT "InboundEmailMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InboundEmailMessage" ADD CONSTRAINT "InboundEmailMessage_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InboundEmailMessage" ADD CONSTRAINT "InboundEmailMessage_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "InboundEmailRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

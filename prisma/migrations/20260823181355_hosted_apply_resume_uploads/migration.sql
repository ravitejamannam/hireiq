-- CreateEnum
CREATE TYPE "HostedResumeParseStatus" AS ENUM ('PARSED', 'FAILED');

-- CreateTable
CREATE TABLE "HostedApplyResumeUpload" (
    "id" SERIAL NOT NULL,
    "distributionId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "applyTokenHash" TEXT NOT NULL,
    "hostedApplySubmissionId" INTEGER NOT NULL,
    "claimTokenHash" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "parseStatus" "HostedResumeParseStatus" NOT NULL,
    "extractedText" TEXT,
    "extractorVersion" TEXT,
    "parseErrorCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostedApplyResumeUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HostedApplyResumeUpload_hostedApplySubmissionId_key" ON "HostedApplyResumeUpload"("hostedApplySubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "HostedApplyResumeUpload_claimTokenHash_key" ON "HostedApplyResumeUpload"("claimTokenHash");

-- CreateIndex
CREATE INDEX "HostedApplyResumeUpload_distributionId_createdAt_idx" ON "HostedApplyResumeUpload"("distributionId", "createdAt");

-- AddForeignKey
ALTER TABLE "HostedApplyResumeUpload" ADD CONSTRAINT "HostedApplyResumeUpload_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "JobDistribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

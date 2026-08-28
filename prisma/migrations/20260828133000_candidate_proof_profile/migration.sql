-- Candidate presentation: photo, LeetCode URL, extra socials.
-- Pending apply photo uploads (claim-token, same pattern as resume).
-- Additive. Not identity, not evidence, not matching/ranking.

ALTER TABLE "CandidateProfile"
ADD COLUMN "photoStorageKey" TEXT,
ADD COLUMN "photoContentType" TEXT,
ADD COLUMN "leetcodeUrl" TEXT,
ADD COLUMN "socialLinks" JSONB;

CREATE TABLE "HostedApplyPhotoUpload" (
    "id" SERIAL NOT NULL,
    "distributionId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "applyTokenHash" TEXT NOT NULL,
    "hostedApplySubmissionId" INTEGER,
    "claimTokenHash" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostedApplyPhotoUpload_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HostedApplyPhotoUpload_hostedApplySubmissionId_key" ON "HostedApplyPhotoUpload"("hostedApplySubmissionId");
CREATE UNIQUE INDEX "HostedApplyPhotoUpload_claimTokenHash_key" ON "HostedApplyPhotoUpload"("claimTokenHash");
CREATE INDEX "HostedApplyPhotoUpload_distributionId_createdAt_idx" ON "HostedApplyPhotoUpload"("distributionId", "createdAt");

ALTER TABLE "HostedApplyPhotoUpload"
ADD CONSTRAINT "HostedApplyPhotoUpload_distributionId_fkey"
FOREIGN KEY ("distributionId") REFERENCES "JobDistribution"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

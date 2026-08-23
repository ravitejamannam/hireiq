-- DropIndex
DROP INDEX "public"."CandidateResumeDocument_companyId_contentSha256_key";

-- CreateIndex
CREATE INDEX "CandidateResumeDocument_companyId_contentSha256_idx" ON "CandidateResumeDocument"("companyId", "contentSha256");

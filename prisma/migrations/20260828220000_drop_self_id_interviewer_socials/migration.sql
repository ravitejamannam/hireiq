-- Stop collecting voluntary equality information at apply.
-- Interviewer profiles gain the same public social/integration fields
-- as candidate profiles (URLs only — not identity, not evaluation).

ALTER TABLE "HostedApplySubmission" DROP COLUMN IF EXISTS "selfIdGender";
ALTER TABLE "HostedApplySubmission" DROP COLUMN IF EXISTS "selfIdConsentedAt";

ALTER TABLE "InterviewerProfile" ADD COLUMN "leetcodeUrl" TEXT;
ALTER TABLE "InterviewerProfile" ADD COLUMN "socialLinks" JSONB;

-- T138: voluntary, aggregate-only equity reporting (Greenhouse-style).
-- Stored on the submission (NOT evidence), never exposed to evaluators,
-- reported only in aggregates with small-cell suppression.
ALTER TABLE "HostedApplySubmission" ADD COLUMN "selfIdGender" TEXT;
ALTER TABLE "HostedApplySubmission" ADD COLUMN "selfIdConsentedAt" TIMESTAMP(3);

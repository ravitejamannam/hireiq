-- T95 recruiter-entered text idempotency.
-- Same company + application + content hash while not revoked.
-- Different text creates a new immutable CandidateEvidence row.
-- Requires 20260818180000 so RECRUITER_ENTERED_TEXT is already committed.

CREATE UNIQUE INDEX "CandidateEvidence_recruiter_text_idempotency_key"
ON "CandidateEvidence" ("companyId", "applicationId", "contentSha256")
WHERE "sourceType" = 'RECRUITER_ENTERED_TEXT'
  AND "applicationId" IS NOT NULL
  AND "contentSha256" IS NOT NULL
  AND "revokedAt" IS NULL;

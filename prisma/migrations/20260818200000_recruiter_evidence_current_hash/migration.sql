-- Recruiter-entered text uniqueness applies to the current artifact only.
-- Superseded and revoked rows stay auditable and must not block re-attach.

DROP INDEX IF EXISTS "CandidateEvidence_recruiter_text_idempotency_key";

CREATE UNIQUE INDEX "CandidateEvidence_recruiter_text_idempotency_key"
ON "CandidateEvidence" ("companyId", "applicationId", "contentSha256")
WHERE "sourceType" = 'RECRUITER_ENTERED_TEXT'
  AND "applicationId" IS NOT NULL
  AND "contentSha256" IS NOT NULL
  AND "revokedAt" IS NULL
  AND "supersededById" IS NULL;

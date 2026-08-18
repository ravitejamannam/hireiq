-- T95: additive CandidateEvidenceSourceType values for textual capture.
-- Does not rewrite T91 evidence semantics, revoke, supersession, or hash.
-- Recruiter idempotency index is in the following migration so PostgreSQL
-- can commit these labels before they are used.

ALTER TYPE "CandidateEvidenceSourceType" ADD VALUE 'INGESTION_EVENT';
ALTER TYPE "CandidateEvidenceSourceType" ADD VALUE 'RECRUITER_ENTERED_TEXT';

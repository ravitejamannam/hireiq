-- Additive only. No column, row or constraint is dropped; the existing boolean stays.
--
-- aiPreference records what the candidate (or a recorded attestation) actually said:
--   UNKNOWN  nothing explicit is on record. AI processing is NOT permitted.
--   ALLOWED  explicit permission.
--   REFUSED  explicit refusal.
-- aiEvaluationOptOut stays as the fail-closed "AI is not permitted" flag that existing readers use.
-- A trigger keeps it equal to (aiPreference <> 'ALLOWED'), and it can never be cleared by a writer
-- that does not also set aiPreference to ALLOWED.

CREATE TYPE "AiPreference" AS ENUM ('UNKNOWN', 'ALLOWED', 'REFUSED');

ALTER TABLE "Application"
  ADD COLUMN "aiPreference" "AiPreference" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "aiPreferenceSource" TEXT,
  ADD COLUMN "aiPreferenceAt" TIMESTAMP(3);

CREATE FUNCTION "application_ai_preference_sync"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW."aiPreference" IS DISTINCT FROM OLD."aiPreference" THEN
    NEW."aiEvaluationOptOut" := NEW."aiPreference" <> 'ALLOWED';
  ELSE
    NEW."aiEvaluationOptOut" := NEW."aiEvaluationOptOut" OR NEW."aiPreference" <> 'ALLOWED';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Legacy rows. The old boolean defaulted to false, so false is NOT evidence of consent.
-- 1. Boolean true: someone refused (candidate portal, or a hosted form before this change). REFUSED.
UPDATE "Application"
   SET "aiPreference" = 'REFUSED', "aiPreferenceSource" = 'LEGACY_OPT_OUT',
       "aiPreferenceAt" = COALESCE("aiOptOutAt", "updatedAt")
 WHERE "aiEvaluationOptOut" = true;

-- 2. Boolean false and the candidate's most recent portal action was an explicit opt-in. ALLOWED.
UPDATE "Application" a
   SET "aiPreference" = 'ALLOWED', "aiPreferenceSource" = 'PORTAL_OPT_IN', "aiPreferenceAt" = last."occurredAt"
  FROM (
    SELECT DISTINCT ON ("targetId") "targetId", action, "occurredAt"
      FROM "AuditLog"
     WHERE "targetType" = 'APPLICATION' AND action IN ('AI_OPT_IN', 'AI_OPT_OUT')
     ORDER BY "targetId", "occurredAt" DESC
  ) last
 WHERE a.id = last."targetId" AND last.action = 'AI_OPT_IN' AND a."aiPreference" = 'UNKNOWN';

-- 3. Boolean false and the hosted form recorded an explicit "allowed" answer. ALLOWED.
UPDATE "Application" a
   SET "aiPreference" = 'ALLOWED', "aiPreferenceSource" = 'HOSTED_FORM', "aiPreferenceAt" = s."consentAcceptedAt"
  FROM "ApplicationIngestionEvent" e
  JOIN "HostedApplySubmission" s ON s.id = e."hostedApplySubmissionId"
 WHERE e."applicationId" = a.id AND a."aiPreference" = 'UNKNOWN'
   AND (s."profilePayload" ->> 'aiEvaluationAllowed') = 'true';

-- 4. Everything else stays UNKNOWN. Record that it is a legacy default, not a choice.
UPDATE "Application"
   SET "aiPreferenceSource" = 'LEGACY_DEFAULT'
 WHERE "aiPreference" = 'UNKNOWN' AND "aiPreferenceSource" IS NULL;

CREATE TRIGGER "application_ai_preference_sync_trg"
  BEFORE INSERT OR UPDATE ON "Application"
  FOR EACH ROW EXECUTE FUNCTION "application_ai_preference_sync"();

-- Force the boolean to match for every existing row (UNKNOWN rows become fail-closed).
UPDATE "Application" SET "aiEvaluationOptOut" = ("aiPreference" <> 'ALLOWED')
 WHERE "aiEvaluationOptOut" IS DISTINCT FROM ("aiPreference" <> 'ALLOWED');

-- Replaces the trigger function from the previous migration; nothing else changes.
-- On INSERT a contradictory row (flag true, preference ALLOWED) now stays blocked instead of being
-- silently allowed. Updating aiPreference still sets the flag from the new preference.
CREATE OR REPLACE FUNCTION "application_ai_preference_sync"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."aiPreference" IS DISTINCT FROM OLD."aiPreference" THEN
    NEW."aiEvaluationOptOut" := NEW."aiPreference" <> 'ALLOWED';
  ELSE
    NEW."aiEvaluationOptOut" := NEW."aiEvaluationOptOut" OR NEW."aiPreference" <> 'ALLOWED';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

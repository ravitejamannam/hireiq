ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "futureRolesConsent" BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('hireiq.allow_audit_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AuditLog is append-only. UPDATE, DELETE, and TRUNCATE are rejected.';
END;
$$;

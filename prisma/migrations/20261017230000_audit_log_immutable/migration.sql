-- UPDATE and DELETE on "AuditLog" are rejected by the trigger.
-- The application role is left unchanged; a stray script using the table owner
-- still cannot rewrite history.

CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only. UPDATE and DELETE are rejected.';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_immutable ON "AuditLog";

CREATE TRIGGER audit_log_immutable
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION audit_log_immutable();

COMMENT ON FUNCTION audit_log_immutable() IS 'UPDATE/DELETE are rejected by the trigger.';

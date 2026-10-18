-- reviewerAction was created as TEXT. Prisma sends the AiReviewerAction enum,
-- so the type has to exist before the client can insert an AIRun.
-- assessment_grade and the other model names stay feature strings, not enum labels.

DO $$ BEGIN
  CREATE TYPE "AiReviewerAction" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'EDITED',
    'DISMISSED',
    'OVERRIDDEN',
    'REFUSED_OPT_OUT'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AIRun" ALTER COLUMN "reviewerAction" DROP DEFAULT;
ALTER TABLE "AIRun"
  ALTER COLUMN "reviewerAction" TYPE "AiReviewerAction"
  USING (
    CASE
      WHEN "reviewerAction" IN ('PENDING', 'ACCEPTED', 'EDITED', 'DISMISSED', 'OVERRIDDEN', 'REFUSED_OPT_OUT')
        THEN "reviewerAction"::"AiReviewerAction"
      ELSE 'PENDING'::"AiReviewerAction"
    END
  );
ALTER TABLE "AIRun" ALTER COLUMN "reviewerAction" SET DEFAULT 'PENDING';

ALTER TABLE "AIRun" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ok';
ALTER TABLE "AIRun" ADD COLUMN IF NOT EXISTS "error" TEXT;

-- The row trigger does not see TRUNCATE. A statement trigger does.
CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only. UPDATE, DELETE, and TRUNCATE are rejected.';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_no_truncate ON "AuditLog";
CREATE TRIGGER audit_log_no_truncate
BEFORE TRUNCATE ON "AuditLog"
FOR EACH STATEMENT
EXECUTE FUNCTION audit_log_immutable();

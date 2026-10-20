-- Candidate portal actions were attributed to the lowest-id ADMIN user, naming someone who did not act.
-- A candidate is not a user, so the actor column may be empty. Historical rows are NOT rewritten: the table is
-- append-only and no UPDATE or DELETE runs here (DDL does not fire the row-level immutability trigger).
ALTER TABLE "AuditLog" ALTER COLUMN "actorUserId" DROP NOT NULL;

-- New CANDIDATE rows must not name a user. NOT VALID applies the rule to new writes only and does not scan or
-- judge existing rows, some of which carry the incorrect administrator id and are left as evidence of the defect.
ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_candidate_has_no_user_actor"
  CHECK ("actorRole" <> 'CANDIDATE' OR "actorUserId" IS NULL) NOT VALID;

-- Rollback (manual): ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_candidate_has_no_user_actor";
-- ALTER COLUMN "actorUserId" SET NOT NULL only succeeds while no row has a null actor.

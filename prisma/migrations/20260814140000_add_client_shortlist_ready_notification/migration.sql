-- T70: Client shortlist-ready is a company-scoped event.
-- Interviewer-facing T68/T69 rows keep interviewerId.
-- Client-facing T70 rows have interviewerId NULL and companyId from Job.

ALTER TYPE "NotificationType" ADD VALUE 'CLIENT_SHORTLIST_READY';

ALTER TABLE "Notification" ADD COLUMN "companyId" INTEGER;

UPDATE "Notification" AS n
SET "companyId" = j."companyId"
FROM "Job" AS j
WHERE n."jobId" = j."id";

ALTER TABLE "Notification" ALTER COLUMN "companyId" SET NOT NULL;

ALTER TABLE "Notification" ALTER COLUMN "interviewerId" DROP NOT NULL;

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Notification_jobId_companyId_type_key"
ON "Notification"("jobId", "companyId", "type");

CREATE INDEX "Notification_companyId_idx" ON "Notification"("companyId");

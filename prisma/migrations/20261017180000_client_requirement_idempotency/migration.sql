-- Request-level idempotency for client requirement creation.
-- Null remains allowed for existing jobs and admin creates.
ALTER TABLE "Job" ADD COLUMN "clientCreateIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "Job_companyId_clientCreateIdempotencyKey_key"
ON "Job"("companyId", "clientCreateIdempotencyKey");

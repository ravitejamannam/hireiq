-- One interviewer can connect Google and Microsoft 365 side by side.
ALTER TABLE "InterviewerCalendarIntegration" DROP CONSTRAINT IF EXISTS "InterviewerCalendarIntegration_userId_key";
DROP INDEX IF EXISTS "InterviewerCalendarIntegration_userId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "InterviewerCalendarIntegration_userId_provider_key"
  ON "InterviewerCalendarIntegration"("userId", "provider");

ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "whatsAppOptInAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "CompanySsoConnection" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanySsoConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "CompanySsoConnection_provider_domain_key" ON "CompanySsoConnection"("provider", "domain");
CREATE INDEX IF NOT EXISTS "CompanySsoConnection_companyId_idx" ON "CompanySsoConnection"("companyId");

CREATE TABLE IF NOT EXISTS "WhatsAppOptIn" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "phoneE164" TEXT NOT NULL,
  "optedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppOptIn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppOptIn_companyId_phoneE164_key" ON "WhatsAppOptIn"("companyId", "phoneE164");

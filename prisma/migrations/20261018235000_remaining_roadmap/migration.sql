ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "requireQualifiedLead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanySsoConnection" ADD COLUMN IF NOT EXISTS "protocol" TEXT NOT NULL DEFAULT 'OIDC';
ALTER TABLE "AssessmentInvite" ADD COLUMN IF NOT EXISTS "aiUsePolicy" TEXT NOT NULL DEFAULT 'NOT_ALLOWED';

CREATE TABLE IF NOT EXISTS "ScimToken" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ScimToken_companyId_idx" ON "ScimToken"("companyId");

CREATE TABLE IF NOT EXISTS "ScimDirectoryUser" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "userName" TEXT NOT NULL,
  "externalId" TEXT,
  "givenName" TEXT NOT NULL DEFAULT '',
  "familyName" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "portalUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("companyId", "userName")
);
CREATE INDEX IF NOT EXISTS "ScimDirectoryUser_companyId_active_idx" ON "ScimDirectoryUser"("companyId", "active");

CREATE TABLE IF NOT EXISTS "ScimDirectoryGroup" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "displayName" TEXT NOT NULL,
  "externalId" TEXT,
  "memberIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("companyId", "displayName")
);

CREATE TABLE IF NOT EXISTS "IdpGroupRole" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "groupName" TEXT NOT NULL,
  "portalRole" TEXT NOT NULL,
  UNIQUE ("companyId", "groupName")
);

CREATE TABLE IF NOT EXISTS "NotetakerConsent" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "interviewId" INTEGER NOT NULL,
  "participantEmail" TEXT NOT NULL,
  "consentedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("companyId", "interviewId", "participantEmail")
);

CREATE TABLE IF NOT EXISTS "NotetakerNote" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "interviewId" INTEGER NOT NULL,
  "quote" TEXT NOT NULL,
  "timestampSec" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "NotetakerNote_companyId_interviewId_idx" ON "NotetakerNote"("companyId", "interviewId");

CREATE TABLE IF NOT EXISTS "AssessmentAiExchange" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "inviteId" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AssessmentAiExchange_companyId_inviteId_idx" ON "AssessmentAiExchange"("companyId", "inviteId");

CREATE TABLE IF NOT EXISTS "HrisHandoff" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "applicationId" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "HrisHandoff_companyId_applicationId_idx" ON "HrisHandoff"("companyId", "applicationId");

CREATE TABLE IF NOT EXISTS "OutreachSequence" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OutreachSequence_companyId_idx" ON "OutreachSequence"("companyId");

CREATE TABLE IF NOT EXISTS "OutreachStep" (
  "id" SERIAL PRIMARY KEY,
  "sequenceId" INTEGER NOT NULL REFERENCES "OutreachSequence"("id") ON DELETE RESTRICT,
  "position" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "approvedByUserId" INTEGER,
  UNIQUE ("sequenceId", "position")
);

CREATE TABLE IF NOT EXISTS "OutreachEnrollment" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "sequenceId" INTEGER NOT NULL REFERENCES "OutreachSequence"("id") ON DELETE RESTRICT,
  "applicationId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "currentStep" INTEGER NOT NULL DEFAULT 0,
  "unsubscribedAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  UNIQUE ("sequenceId", "applicationId")
);
CREATE INDEX IF NOT EXISTS "OutreachEnrollment_companyId_status_idx" ON "OutreachEnrollment"("companyId", "status");

CREATE TABLE IF NOT EXISTS "ProfileCapture" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "userId" INTEGER NOT NULL,
  "profileUrl" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "headline" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ProfileCapture_companyId_createdAt_idx" ON "ProfileCapture"("companyId", "createdAt");

CREATE TABLE IF NOT EXISTS "OfferEsign" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "applicationId" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "aadhaar" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OfferEsign_companyId_applicationId_idx" ON "OfferEsign"("companyId", "applicationId");

CREATE TABLE IF NOT EXISTS "InterviewerTraining" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "interviewerId" INTEGER NOT NULL,
  "shadowSessions" INTEGER NOT NULL DEFAULT 0,
  "reverseShadowSessions" INTEGER NOT NULL DEFAULT 0,
  "qualifiedAt" TIMESTAMP(3),
  UNIQUE ("companyId", "interviewerId")
);

CREATE TABLE IF NOT EXISTS "ShadowObservation" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "interviewId" INTEGER NOT NULL,
  "leadInterviewerId" INTEGER NOT NULL,
  "observerInterviewerId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ShadowObservation_companyId_leadInterviewerId_idx" ON "ShadowObservation"("companyId", "leadInterviewerId");

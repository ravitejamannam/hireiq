-- T90: company-scoped logical candidate identity.
-- Additive. Does not alter Candidate, CandidateProfile, Application,
-- Application.source, SourcingDatabaseSource, ingestion contracts, or JWT.
-- Does not auto-link Candidates. Backfills identity signals only.

-- CreateEnum
CREATE TYPE "CandidateIdentitySignalKind" AS ENUM ('EMAIL', 'PHONE', 'PROVIDER_CANDIDATE_ID', 'LINKEDIN_URL');

-- CreateEnum
CREATE TYPE "CandidateIdentityDecisionType" AS ENUM ('LINK', 'NO_LINK', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "CompanyPerson" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateIdentityMembership" (
    "id" SERIAL NOT NULL,
    "companyPersonId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateIdentityMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateIdentitySignal" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "kind" "CandidateIdentitySignalKind" NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "sourceChannel" "ApplicationIngestionChannel",
    "ingestionEventId" INTEGER,
    "hostedApplySubmissionId" INTEGER,
    "providerConnectionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateIdentitySignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateIdentityDecision" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "decision" "CandidateIdentityDecisionType" NOT NULL,
    "reasonCodes" TEXT[],
    "leftCandidateId" INTEGER NOT NULL,
    "rightCandidateId" INTEGER NOT NULL,
    "actorUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateIdentityDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyPerson_id_companyId_key" ON "CompanyPerson"("id", "companyId");

-- CreateIndex
CREATE INDEX "CompanyPerson_companyId_idx" ON "CompanyPerson"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateIdentityMembership_candidateId_key" ON "CandidateIdentityMembership"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateIdentityMembership_candidateId_companyId_key" ON "CandidateIdentityMembership"("candidateId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateIdentityMembership_companyPersonId_candidateId_key" ON "CandidateIdentityMembership"("companyPersonId", "candidateId");

-- CreateIndex
CREATE INDEX "CandidateIdentityMembership_companyId_idx" ON "CandidateIdentityMembership"("companyId");

-- CreateIndex
CREATE INDEX "CandidateIdentityMembership_companyPersonId_idx" ON "CandidateIdentityMembership"("companyPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateIdentitySignal_companyId_candidateId_kind_normalizedValue_key" ON "CandidateIdentitySignal"("companyId", "candidateId", "kind", "normalizedValue");

-- CreateIndex
CREATE INDEX "CandidateIdentitySignal_companyId_kind_normalizedValue_idx" ON "CandidateIdentitySignal"("companyId", "kind", "normalizedValue");

-- CreateIndex
CREATE INDEX "CandidateIdentitySignal_candidateId_idx" ON "CandidateIdentitySignal"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateIdentitySignal_ingestionEventId_idx" ON "CandidateIdentitySignal"("ingestionEventId");

-- CreateIndex
CREATE INDEX "CandidateIdentityDecision_companyId_createdAt_idx" ON "CandidateIdentityDecision"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CandidateIdentityDecision_leftCandidateId_idx" ON "CandidateIdentityDecision"("leftCandidateId");

-- CreateIndex
CREATE INDEX "CandidateIdentityDecision_rightCandidateId_idx" ON "CandidateIdentityDecision"("rightCandidateId");

-- Tenant-safe composite unique keys for signal provenance FKs (additive).
CREATE UNIQUE INDEX "ApplicationIngestionEvent_id_companyId_key" ON "ApplicationIngestionEvent"("id", "companyId");

CREATE UNIQUE INDEX "HostedApplySubmission_id_companyId_key" ON "HostedApplySubmission"("id", "companyId");

CREATE UNIQUE INDEX "ProviderConnection_id_companyId_key" ON "ProviderConnection"("id", "companyId");

-- AddForeignKey
ALTER TABLE "CompanyPerson" ADD CONSTRAINT "CompanyPerson_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateIdentityMembership" ADD CONSTRAINT "CandidateIdentityMembership_companyPersonId_companyId_fkey" FOREIGN KEY ("companyPersonId", "companyId") REFERENCES "CompanyPerson"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateIdentityMembership" ADD CONSTRAINT "CandidateIdentityMembership_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CandidateIdentityMembership" ADD CONSTRAINT "CandidateIdentityMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateIdentitySignal" ADD CONSTRAINT "CandidateIdentitySignal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateIdentitySignal" ADD CONSTRAINT "CandidateIdentitySignal_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CandidateIdentitySignal" ADD CONSTRAINT "CandidateIdentitySignal_ingestionEventId_companyId_fkey" FOREIGN KEY ("ingestionEventId", "companyId") REFERENCES "ApplicationIngestionEvent"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateIdentitySignal" ADD CONSTRAINT "CandidateIdentitySignal_hostedApplySubmissionId_companyId_fkey" FOREIGN KEY ("hostedApplySubmissionId", "companyId") REFERENCES "HostedApplySubmission"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateIdentitySignal" ADD CONSTRAINT "CandidateIdentitySignal_providerConnectionId_companyId_fkey" FOREIGN KEY ("providerConnectionId", "companyId") REFERENCES "ProviderConnection"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateIdentityDecision" ADD CONSTRAINT "CandidateIdentityDecision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateIdentityDecision" ADD CONSTRAINT "CandidateIdentityDecision_leftCandidateId_companyId_fkey" FOREIGN KEY ("leftCandidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateIdentityDecision" ADD CONSTRAINT "CandidateIdentityDecision_rightCandidateId_companyId_fkey" FOREIGN KEY ("rightCandidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateIdentityDecision" ADD CONSTRAINT "CandidateIdentityDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Historical signal backfill from ingestion events / hosted apply only.
-- Does NOT create CompanyPerson groups. Does NOT auto-link Candidates.
-- NAUKRI events are excluded. T69 applications with no events produce no signals.

INSERT INTO "CandidateIdentitySignal" (
    "companyId",
    "candidateId",
    "kind",
    "normalizedValue",
    "sourceChannel",
    "ingestionEventId",
    "hostedApplySubmissionId",
    "providerConnectionId",
    "createdAt",
    "updatedAt"
)
SELECT DISTINCT ON (e."companyId", e."candidateId", LOWER(TRIM(e."applicantEmailNormalized")))
    e."companyId",
    e."candidateId",
    'EMAIL'::"CandidateIdentitySignalKind",
    LOWER(TRIM(e."applicantEmailNormalized")),
    e."sourceChannel",
    e."id",
    e."hostedApplySubmissionId",
    d."providerConnectionId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "ApplicationIngestionEvent" e
LEFT JOIN "JobDistribution" d ON d."id" = e."distributionId"
WHERE e."candidateId" IS NOT NULL
  AND e."sourceChannel" <> 'NAUKRI'
  AND e."applicantEmailNormalized" IS NOT NULL
  AND TRIM(e."applicantEmailNormalized") <> ''
  AND POSITION('@' IN TRIM(e."applicantEmailNormalized")) > 1
ON CONFLICT ("companyId", "candidateId", "kind", "normalizedValue") DO NOTHING;

INSERT INTO "CandidateIdentitySignal" (
    "companyId",
    "candidateId",
    "kind",
    "normalizedValue",
    "sourceChannel",
    "ingestionEventId",
    "hostedApplySubmissionId",
    "providerConnectionId",
    "createdAt",
    "updatedAt"
)
SELECT DISTINCT ON (e."companyId", e."candidateId", TRIM(e."applicantPhone"))
    e."companyId",
    e."candidateId",
    'PHONE'::"CandidateIdentitySignalKind",
    TRIM(e."applicantPhone"),
    e."sourceChannel",
    e."id",
    e."hostedApplySubmissionId",
    d."providerConnectionId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "ApplicationIngestionEvent" e
LEFT JOIN "JobDistribution" d ON d."id" = e."distributionId"
WHERE e."candidateId" IS NOT NULL
  AND e."sourceChannel" <> 'NAUKRI'
  AND e."applicantPhone" IS NOT NULL
  AND TRIM(e."applicantPhone") <> ''
ON CONFLICT ("companyId", "candidateId", "kind", "normalizedValue") DO NOTHING;

INSERT INTO "CandidateIdentitySignal" (
    "companyId",
    "candidateId",
    "kind",
    "normalizedValue",
    "sourceChannel",
    "ingestionEventId",
    "hostedApplySubmissionId",
    "providerConnectionId",
    "createdAt",
    "updatedAt"
)
SELECT DISTINCT ON (
    e."companyId",
    e."candidateId",
    REGEXP_REPLACE(LOWER(TRIM(e."applicantLinkedInUrl")), '/+$', '')
)
    e."companyId",
    e."candidateId",
    'LINKEDIN_URL'::"CandidateIdentitySignalKind",
    REGEXP_REPLACE(LOWER(TRIM(e."applicantLinkedInUrl")), '/+$', ''),
    e."sourceChannel",
    e."id",
    e."hostedApplySubmissionId",
    d."providerConnectionId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "ApplicationIngestionEvent" e
LEFT JOIN "JobDistribution" d ON d."id" = e."distributionId"
WHERE e."candidateId" IS NOT NULL
  AND e."sourceChannel" <> 'NAUKRI'
  AND e."applicantLinkedInUrl" IS NOT NULL
  AND TRIM(e."applicantLinkedInUrl") <> ''
ON CONFLICT ("companyId", "candidateId", "kind", "normalizedValue") DO NOTHING;

INSERT INTO "CandidateIdentitySignal" (
    "companyId",
    "candidateId",
    "kind",
    "normalizedValue",
    "sourceChannel",
    "ingestionEventId",
    "hostedApplySubmissionId",
    "providerConnectionId",
    "createdAt",
    "updatedAt"
)
SELECT DISTINCT ON (
    e."companyId",
    e."candidateId",
    (e."sourceChannel"::text || ':' || TRIM(e."externalCandidateId"))
)
    e."companyId",
    e."candidateId",
    'PROVIDER_CANDIDATE_ID'::"CandidateIdentitySignalKind",
    e."sourceChannel"::text || ':' || TRIM(e."externalCandidateId"),
    e."sourceChannel",
    e."id",
    e."hostedApplySubmissionId",
    d."providerConnectionId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "ApplicationIngestionEvent" e
LEFT JOIN "JobDistribution" d ON d."id" = e."distributionId"
WHERE e."candidateId" IS NOT NULL
  AND e."sourceChannel" IN ('LINKEDIN', 'INDEED')
  AND e."externalCandidateId" IS NOT NULL
  AND TRIM(e."externalCandidateId") <> ''
ON CONFLICT ("companyId", "candidateId", "kind", "normalizedValue") DO NOTHING;

-- Hosted apply submissions whose linked ingestion event already attached a Candidate
-- may carry phone/LinkedIn that the event omitted. Do not invent Candidate handles.
INSERT INTO "CandidateIdentitySignal" (
    "companyId",
    "candidateId",
    "kind",
    "normalizedValue",
    "sourceChannel",
    "ingestionEventId",
    "hostedApplySubmissionId",
    "providerConnectionId",
    "createdAt",
    "updatedAt"
)
SELECT DISTINCT ON (e."companyId", e."candidateId", LOWER(TRIM(s."emailNormalized")))
    e."companyId",
    e."candidateId",
    'EMAIL'::"CandidateIdentitySignalKind",
    LOWER(TRIM(s."emailNormalized")),
    'HOSTED_APPLY'::"ApplicationIngestionChannel",
    e."id",
    s."id",
    d."providerConnectionId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "HostedApplySubmission" s
INNER JOIN "ApplicationIngestionEvent" e ON e."hostedApplySubmissionId" = s."id"
LEFT JOIN "JobDistribution" d ON d."id" = s."distributionId"
WHERE e."candidateId" IS NOT NULL
  AND e."companyId" = s."companyId"
  AND s."emailNormalized" IS NOT NULL
  AND TRIM(s."emailNormalized") <> ''
ON CONFLICT ("companyId", "candidateId", "kind", "normalizedValue") DO NOTHING;

INSERT INTO "CandidateIdentitySignal" (
    "companyId",
    "candidateId",
    "kind",
    "normalizedValue",
    "sourceChannel",
    "ingestionEventId",
    "hostedApplySubmissionId",
    "providerConnectionId",
    "createdAt",
    "updatedAt"
)
SELECT DISTINCT ON (e."companyId", e."candidateId", TRIM(s."phone"))
    e."companyId",
    e."candidateId",
    'PHONE'::"CandidateIdentitySignalKind",
    TRIM(s."phone"),
    'HOSTED_APPLY'::"ApplicationIngestionChannel",
    e."id",
    s."id",
    d."providerConnectionId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "HostedApplySubmission" s
INNER JOIN "ApplicationIngestionEvent" e ON e."hostedApplySubmissionId" = s."id"
LEFT JOIN "JobDistribution" d ON d."id" = s."distributionId"
WHERE e."candidateId" IS NOT NULL
  AND e."companyId" = s."companyId"
  AND s."phone" IS NOT NULL
  AND TRIM(s."phone") <> ''
ON CONFLICT ("companyId", "candidateId", "kind", "normalizedValue") DO NOTHING;

INSERT INTO "CandidateIdentitySignal" (
    "companyId",
    "candidateId",
    "kind",
    "normalizedValue",
    "sourceChannel",
    "ingestionEventId",
    "hostedApplySubmissionId",
    "providerConnectionId",
    "createdAt",
    "updatedAt"
)
SELECT DISTINCT ON (
    e."companyId",
    e."candidateId",
    REGEXP_REPLACE(LOWER(TRIM(s."linkedInUrl")), '/+$', '')
)
    e."companyId",
    e."candidateId",
    'LINKEDIN_URL'::"CandidateIdentitySignalKind",
    REGEXP_REPLACE(LOWER(TRIM(s."linkedInUrl")), '/+$', ''),
    'HOSTED_APPLY'::"ApplicationIngestionChannel",
    e."id",
    s."id",
    d."providerConnectionId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "HostedApplySubmission" s
INNER JOIN "ApplicationIngestionEvent" e ON e."hostedApplySubmissionId" = s."id"
LEFT JOIN "JobDistribution" d ON d."id" = s."distributionId"
WHERE e."candidateId" IS NOT NULL
  AND e."companyId" = s."companyId"
  AND s."linkedInUrl" IS NOT NULL
  AND TRIM(s."linkedInUrl") <> ''
ON CONFLICT ("companyId", "candidateId", "kind", "normalizedValue") DO NOTHING;

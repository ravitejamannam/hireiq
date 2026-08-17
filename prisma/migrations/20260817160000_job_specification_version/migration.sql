-- T81: versioned JobSpecificationVersion. Additive. Does not alter
-- requirementLifecycle, SLA timestamps, assignment, billing, or applications.

-- CreateEnum
CREATE TYPE "JobSpecificationVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "JobSpecificationVersion" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "JobSpecificationVersionStatus" NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" INTEGER,
    "title" TEXT NOT NULL,
    "roleCategory" "RoleCategory",
    "experienceRange" TEXT,
    "location" TEXT,
    "compensationRange" TEXT,
    "targetHireDate" TIMESTAMP(3),
    "numberOfPositions" INTEGER,
    "mustHaveRequirements" TEXT,
    "niceToHaveRequirements" TEXT,
    "jobDescription" TEXT,
    "evaluationCriteria" TEXT,
    "primarySkills" TEXT,
    "structuredPayload" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "JobSpecificationVersion_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "currentPublishedSpecificationVersionId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "JobSpecificationVersion_jobId_versionNumber_key" ON "JobSpecificationVersion"("jobId", "versionNumber");

-- CreateIndex
CREATE INDEX "JobSpecificationVersion_jobId_status_idx" ON "JobSpecificationVersion"("jobId", "status");

-- Partial unique: one DRAFT per Job
CREATE UNIQUE INDEX "JobSpecificationVersion_one_draft_per_job"
ON "JobSpecificationVersion" ("jobId")
WHERE "status" = 'DRAFT';

-- CreateIndex
CREATE UNIQUE INDEX "Job_currentPublishedSpecificationVersionId_key" ON "Job"("currentPublishedSpecificationVersionId");

-- AddForeignKey
ALTER TABLE "JobSpecificationVersion" ADD CONSTRAINT "JobSpecificationVersion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSpecificationVersion" ADD CONSTRAINT "JobSpecificationVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_currentPublishedSpecificationVersionId_fkey" FOREIGN KEY ("currentPublishedSpecificationVersionId") REFERENCES "JobSpecificationVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Idempotent backfill: meaningful spec → PUBLISHED v1 + pointer.
INSERT INTO "JobSpecificationVersion" (
    "jobId",
    "versionNumber",
    "status",
    "publishedAt",
    "createdAt",
    "updatedAt",
    "title",
    "roleCategory",
    "experienceRange",
    "location",
    "compensationRange",
    "targetHireDate",
    "numberOfPositions",
    "mustHaveRequirements",
    "niceToHaveRequirements",
    "jobDescription",
    "evaluationCriteria",
    "primarySkills",
    "structuredPayload"
)
SELECT
    j."id",
    1,
    'PUBLISHED',
    COALESCE(j."clientCompletedAt", j."createdAt"),
    NOW(),
    NOW(),
    j."title",
    j."roleCategory",
    j."experienceRange",
    j."location",
    j."compensationRange",
    j."targetHireDate",
    j."numberOfPositions",
    j."mustHaveRequirements",
    j."niceToHaveRequirements",
    j."jobDescription",
    j."evaluationCriteria",
    j."primarySkills",
    '{"schemaVersion": 1, "legacy": true}'::jsonb
FROM "Job" j
WHERE NOT EXISTS (
    SELECT 1 FROM "JobSpecificationVersion" v WHERE v."jobId" = j."id"
)
AND (
    j."roleCategory" IS NOT NULL
    OR j."experienceRange" IS NOT NULL
    OR j."location" IS NOT NULL
    OR j."compensationRange" IS NOT NULL
    OR j."targetHireDate" IS NOT NULL
    OR j."numberOfPositions" IS NOT NULL
    OR j."mustHaveRequirements" IS NOT NULL
    OR j."niceToHaveRequirements" IS NOT NULL
    OR j."jobDescription" IS NOT NULL
    OR j."evaluationCriteria" IS NOT NULL
    OR j."primarySkills" IS NOT NULL
);

UPDATE "Job" j
SET "currentPublishedSpecificationVersionId" = v."id"
FROM "JobSpecificationVersion" v
WHERE v."jobId" = j."id"
  AND v."status" = 'PUBLISHED'
  AND v."versionNumber" = 1
  AND j."currentPublishedSpecificationVersionId" IS NULL;

-- T80 title-only / empty drafts: DRAFT v1, no published pointer.
INSERT INTO "JobSpecificationVersion" (
    "jobId",
    "versionNumber",
    "status",
    "publishedAt",
    "createdAt",
    "updatedAt",
    "title",
    "roleCategory",
    "experienceRange",
    "location",
    "compensationRange",
    "targetHireDate",
    "numberOfPositions",
    "mustHaveRequirements",
    "niceToHaveRequirements",
    "jobDescription",
    "evaluationCriteria",
    "primarySkills",
    "structuredPayload"
)
SELECT
    j."id",
    1,
    'DRAFT',
    NULL,
    NOW(),
    NOW(),
    j."title",
    j."roleCategory",
    j."experienceRange",
    j."location",
    j."compensationRange",
    j."targetHireDate",
    j."numberOfPositions",
    j."mustHaveRequirements",
    j."niceToHaveRequirements",
    j."jobDescription",
    j."evaluationCriteria",
    j."primarySkills",
    '{"schemaVersion": 1, "legacy": true}'::jsonb
FROM "Job" j
WHERE NOT EXISTS (
    SELECT 1 FROM "JobSpecificationVersion" v WHERE v."jobId" = j."id"
);

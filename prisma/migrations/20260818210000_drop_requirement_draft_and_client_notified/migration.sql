-- Collapse REQUIREMENT_DRAFTED and CLIENT_NOTIFIED. Roles are posted at
-- create time. PostgreSQL cannot drop enum values in place.

-- Promote leftover drafts so posted jobs have a published specification.
UPDATE "JobSpecificationVersion" v
SET
  "status" = 'PUBLISHED',
  "publishedAt" = COALESCE(v."publishedAt", NOW())
FROM "Job" j
WHERE v."jobId" = j."id"
  AND v."status" = 'DRAFT'
  AND j."requirementLifecycle" IN ('REQUIREMENT_DRAFTED', 'CLIENT_NOTIFIED')
  AND j."currentPublishedSpecificationVersionId" IS NULL;

UPDATE "Job" j
SET "currentPublishedSpecificationVersionId" = v."id"
FROM "JobSpecificationVersion" v
WHERE v."jobId" = j."id"
  AND v."status" = 'PUBLISHED'
  AND j."currentPublishedSpecificationVersionId" IS NULL
  AND j."requirementLifecycle" IN ('REQUIREMENT_DRAFTED', 'CLIENT_NOTIFIED');

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
    COALESCE((
      SELECT MAX(v."versionNumber")
      FROM "JobSpecificationVersion" v
      WHERE v."jobId" = j."id"
    ), 0) + 1,
    'PUBLISHED',
    NOW(),
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
WHERE j."requirementLifecycle" IN ('REQUIREMENT_DRAFTED', 'CLIENT_NOTIFIED')
  AND j."currentPublishedSpecificationVersionId" IS NULL;

UPDATE "Job" j
SET "currentPublishedSpecificationVersionId" = v."id"
FROM "JobSpecificationVersion" v
WHERE v."jobId" = j."id"
  AND v."status" = 'PUBLISHED'
  AND j."currentPublishedSpecificationVersionId" IS NULL
  AND j."requirementLifecycle" IN ('REQUIREMENT_DRAFTED', 'CLIENT_NOTIFIED');

UPDATE "Job"
SET
  "requirementLifecycle" = 'REQUIREMENT_POSTED',
  "clientCompletedAt" = COALESCE("clientCompletedAt", NOW())
WHERE "requirementLifecycle" IN ('REQUIREMENT_DRAFTED', 'CLIENT_NOTIFIED');

ALTER TABLE "Job" ALTER COLUMN "requirementLifecycle" DROP DEFAULT;

ALTER TYPE "RequirementLifecycle" RENAME TO "RequirementLifecycle_old";

CREATE TYPE "RequirementLifecycle" AS ENUM (
  'REQUIREMENT_POSTED',
  'INTERVIEWER_NOTIFIED',
  'SOURCING_SHORTLISTING',
  'BILLING_GENERATED'
);

ALTER TABLE "Job"
  ALTER COLUMN "requirementLifecycle" TYPE "RequirementLifecycle"
  USING "requirementLifecycle"::text::"RequirementLifecycle";

ALTER TABLE "Job"
  ALTER COLUMN "requirementLifecycle" SET DEFAULT 'REQUIREMENT_POSTED';

DROP TYPE "RequirementLifecycle_old";

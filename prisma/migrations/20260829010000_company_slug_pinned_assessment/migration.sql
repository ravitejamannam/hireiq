-- Public careers hub slug on Company.
-- Frozen assessment question IDs on published specification versions.
-- Additive. Empty question arrays stay empty (legacy mint from live bank).

ALTER TABLE "Company" ADD COLUMN "publicSlug" TEXT;

UPDATE "Company"
SET "publicSlug" = trim(both '-' from lower(regexp_replace(
  regexp_replace(name, '[^A-Za-z0-9]+', '-', 'g'),
  '-+',
  '-',
  'g'
)));

UPDATE "Company"
SET "publicSlug" = 'company'
WHERE "publicSlug" IS NULL OR "publicSlug" = '';

UPDATE "Company" AS c
SET "publicSlug" = c."publicSlug" || '-' || c.id::text
WHERE c.id IN (
  SELECT ranked.id
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY "publicSlug" ORDER BY id) AS rn
    FROM "Company"
  ) ranked
  WHERE ranked.rn > 1
);

ALTER TABLE "Company" ALTER COLUMN "publicSlug" SET NOT NULL;

CREATE UNIQUE INDEX "Company_publicSlug_key" ON "Company"("publicSlug");

ALTER TABLE "JobSpecificationVersion"
ADD COLUMN "assessmentQuestionIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

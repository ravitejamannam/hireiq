-- Ticket 64: database-enforced Application tenant integrity
-- Candidate.companyId must equal Job.companyId for every Application.
-- Fails safely if mismatched rows already exist (no silent repair).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Application" a
    JOIN "Candidate" c ON c.id = a."candidateId"
    JOIN "Job" j ON j.id = a."jobId"
    WHERE c."companyId" <> j."companyId"
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce application tenant integrity: existing Application rows have Candidate/Job company mismatches';
  END IF;
END $$;

-- Composite unique keys required for composite foreign keys
CREATE UNIQUE INDEX "Candidate_id_companyId_key" ON "Candidate"("id", "companyId");
CREATE UNIQUE INDEX "Job_id_companyId_key" ON "Job"("id", "companyId");

-- Denormalized tenant key on Application
ALTER TABLE "Application" ADD COLUMN "companyId" INTEGER;

UPDATE "Application" AS a
SET "companyId" = j."companyId"
FROM "Job" AS j
WHERE j.id = a."jobId";

-- Safety: refuse to proceed if any Application still lacks companyId
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Application" WHERE "companyId" IS NULL) THEN
    RAISE EXCEPTION
      'Cannot enforce application tenant integrity: Application.companyId backfill left NULL values';
  END IF;
END $$;

ALTER TABLE "Application" ALTER COLUMN "companyId" SET NOT NULL;

CREATE INDEX "Application_companyId_idx" ON "Application"("companyId");

-- Replace single-column FKs with composite tenant FKs
ALTER TABLE "Application" DROP CONSTRAINT "Application_candidateId_fkey";
ALTER TABLE "Application" DROP CONSTRAINT "Application_jobId_fkey";

ALTER TABLE "Application"
  ADD CONSTRAINT "Application_candidateId_companyId_fkey"
  FOREIGN KEY ("candidateId", "companyId")
  REFERENCES "Candidate"("id", "companyId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "Application"
  ADD CONSTRAINT "Application_jobId_companyId_fkey"
  FOREIGN KEY ("jobId", "companyId")
  REFERENCES "Job"("id", "companyId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

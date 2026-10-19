DO $$ BEGIN
  CREATE TYPE "RequirementOwnershipType" AS ENUM ('REQUIRED', 'PREFERRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RequirementEvidenceType" AS ENUM ('RESUME', 'ASSESSMENT', 'INTERVIEW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "JobRequirement" ADD COLUMN IF NOT EXISTS "requirementType" "RequirementOwnershipType" NOT NULL DEFAULT 'REQUIRED';
ALTER TABLE "JobRequirement" ADD COLUMN IF NOT EXISTS "evidenceType" "RequirementEvidenceType";

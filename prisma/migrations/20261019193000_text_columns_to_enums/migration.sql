DO $$ BEGIN
  CREATE TYPE "RequirementOrigin" AS ENUM ('HUMAN', 'AI');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RequirementApprovalStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "EvidenceReviewStatus" AS ENUM ('MEETS', 'NOT_MET', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WorkflowTrigger" AS ENUM ('STAGE_CHANGE', 'TIME_ELAPSED', 'FORM_SUBMITTED', 'SCORECARD_OVERDUE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "JobRequirement" ALTER COLUMN "requirementType" DROP DEFAULT;
ALTER TABLE "JobRequirement" ALTER COLUMN "origin" DROP DEFAULT;
ALTER TABLE "JobRequirement" ALTER COLUMN "approvalStatus" DROP DEFAULT;
ALTER TABLE "WorkflowRule" ALTER COLUMN "trigger" DROP DEFAULT;

ALTER TABLE "JobRequirement"
  ALTER COLUMN "requirementType" TYPE "RequirementOwnershipType"
  USING (
    CASE
      WHEN "requirementType" IN ('REQUIRED', 'PREFERRED') THEN "requirementType"::"RequirementOwnershipType"
      ELSE 'REQUIRED'::"RequirementOwnershipType"
    END
  );

ALTER TABLE "JobRequirement"
  ALTER COLUMN "origin" TYPE "RequirementOrigin"
  USING (
    CASE
      WHEN "origin" IN ('HUMAN', 'AI') THEN "origin"::"RequirementOrigin"
      ELSE 'AI'::"RequirementOrigin"
    END
  );

ALTER TABLE "JobRequirement"
  ALTER COLUMN "approvalStatus" TYPE "RequirementApprovalStatus"
  USING (
    CASE
      WHEN "approvalStatus" IN ('DRAFT', 'APPROVED', 'REJECTED') THEN "approvalStatus"::"RequirementApprovalStatus"
      ELSE 'DRAFT'::"RequirementApprovalStatus"
    END
  );

ALTER TABLE "JobRequirement"
  ALTER COLUMN "evidenceType" DROP DEFAULT;
ALTER TABLE "JobRequirement"
  ALTER COLUMN "evidenceType" TYPE "RequirementEvidenceType"
  USING (
    CASE
      WHEN "evidenceType" IN ('RESUME', 'ASSESSMENT', 'INTERVIEW') THEN "evidenceType"::"RequirementEvidenceType"
      ELSE NULL
    END
  );

ALTER TABLE "RequirementAssessment" ALTER COLUMN "reviewStatus" DROP DEFAULT;
ALTER TABLE "RequirementAssessment"
  ALTER COLUMN "reviewStatus" TYPE "EvidenceReviewStatus"
  USING (
    CASE
      WHEN "reviewStatus" IN ('MEETS', 'NOT_MET', 'UNKNOWN') THEN "reviewStatus"::"EvidenceReviewStatus"
      ELSE 'UNKNOWN'::"EvidenceReviewStatus"
    END
  );

ALTER TABLE "WorkflowRule"
  ALTER COLUMN "trigger" TYPE "WorkflowTrigger"
  USING (
    CASE
      WHEN "trigger" IN ('STAGE_CHANGE', 'TIME_ELAPSED', 'FORM_SUBMITTED', 'SCORECARD_OVERDUE')
        THEN "trigger"::"WorkflowTrigger"
      ELSE 'STAGE_CHANGE'::"WorkflowTrigger"
    END
  );

ALTER TABLE "JobRequirement" ALTER COLUMN "requirementType" SET DEFAULT 'REQUIRED';
ALTER TABLE "JobRequirement" ALTER COLUMN "origin" SET DEFAULT 'AI';
ALTER TABLE "JobRequirement" ALTER COLUMN "approvalStatus" SET DEFAULT 'DRAFT';
ALTER TABLE "WorkflowRule" ALTER COLUMN "trigger" SET DEFAULT 'STAGE_CHANGE';

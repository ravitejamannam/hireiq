-- MVP roadmap: audit stays append-only in application code.
-- Additive columns and tables for phases 0-8.

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "applyNoticeText" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "brandTone" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "brandBenefits" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "eeoBoilerplate" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "evidenceMatchingEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "level" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "team" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "scopeText" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "outcomesText" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "payBand" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "remotePolicy" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "evidenceMatchingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "blindReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "publishApprovedAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "publishApprovedByUserId" INTEGER;

ALTER TABLE "JobSpecificationVersion" ADD COLUMN IF NOT EXISTS "level" TEXT;
ALTER TABLE "JobSpecificationVersion" ADD COLUMN IF NOT EXISTS "team" TEXT;
ALTER TABLE "JobSpecificationVersion" ADD COLUMN IF NOT EXISTS "scopeText" TEXT;
ALTER TABLE "JobSpecificationVersion" ADD COLUMN IF NOT EXISTS "outcomesText" TEXT;
ALTER TABLE "JobSpecificationVersion" ADD COLUMN IF NOT EXISTS "payBand" TEXT;
ALTER TABLE "JobSpecificationVersion" ADD COLUMN IF NOT EXISTS "remotePolicy" TEXT;

ALTER TABLE "JobRequirement" ADD COLUMN IF NOT EXISTS "requirementType" TEXT NOT NULL DEFAULT 'REQUIRED';
ALTER TABLE "JobRequirement" ADD COLUMN IF NOT EXISTS "evidenceType" TEXT;
ALTER TABLE "JobRequirement" ADD COLUMN IF NOT EXISTS "weight" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "JobRequirement" ADD COLUMN IF NOT EXISTS "rationale" TEXT;
ALTER TABLE "JobRequirement" ADD COLUMN IF NOT EXISTS "origin" TEXT NOT NULL DEFAULT 'AI';
ALTER TABLE "JobRequirement" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "JobRequirement" ADD COLUMN IF NOT EXISTS "approvedByUserId" INTEGER;
ALTER TABLE "JobRequirement" ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "RequirementAssessment" ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "RequirementAssessment" ADD COLUMN IF NOT EXISTS "citationQuote" TEXT;
ALTER TABLE "RequirementAssessment" ADD COLUMN IF NOT EXISTS "overrideReason" TEXT;
ALTER TABLE "RequirementAssessment" ADD COLUMN IF NOT EXISTS "overriddenByUserId" INTEGER;

ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "rejectionReasonCode" TEXT;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "aiEvaluationOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "aiOptOutAt" TIMESTAMP(3);
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "consentAt" TIMESTAMP(3);
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "applyNoticeVersion" TEXT;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "humanReviewRequestedAt" TIMESTAMP(3);

ALTER TABLE "Evaluation" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "EvaluationQuestion" ADD COLUMN IF NOT EXISTS "jobRequirementId" INTEGER;

ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "bodyJson" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "narrative" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "inputHash" TEXT;

ALTER TABLE "BlueprintQuestion" ADD COLUMN IF NOT EXISTS "jobRequirementId" INTEGER;
ALTER TABLE "BlueprintQuestion" ADD COLUMN IF NOT EXISTS "anchorLow" TEXT;
ALTER TABLE "BlueprintQuestion" ADD COLUMN IF NOT EXISTS "anchorMid" TEXT;
ALTER TABLE "BlueprintQuestion" ADD COLUMN IF NOT EXISTS "anchorHigh" TEXT;

CREATE TABLE IF NOT EXISTS "AIRun" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "feature" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" INTEGER NOT NULL,
  "modelId" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "outputJson" JSONB NOT NULL,
  "latencyMs" INTEGER NOT NULL,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "reviewerAction" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewerReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AIRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "AIRun_companyId_feature_createdAt_idx" ON "AIRun"("companyId", "feature", "createdAt");

CREATE TABLE IF NOT EXISTS "CompanyFeatureFlag" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "feature" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyFeatureFlag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT,
  CONSTRAINT "CompanyFeatureFlag_companyId_feature_key" UNIQUE ("companyId", "feature")
);

CREATE TABLE IF NOT EXISTS "JdLintDismissal" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "jobId" INTEGER NOT NULL,
  "ruleId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JdLintDismissal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "WorkflowRule" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "trigger" TEXT NOT NULL,
  "conditionJson" JSONB NOT NULL,
  "actionJson" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "WorkflowExecution" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "ruleId" INTEGER NOT NULL,
  "ruleVersion" INTEGER NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT false,
  "outcome" TEXT NOT NULL,
  "detailJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowExecution_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT,
  CONSTRAINT "WorkflowExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "WorkflowRule"("id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "KnockoutQuestion" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "jobId" INTEGER NOT NULL,
  "prompt" TEXT NOT NULL,
  "expectedAnswer" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "KnockoutQuestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "RetentionPolicy" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL UNIQUE,
  "jurisdiction" TEXT NOT NULL,
  "retentionDays" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RetentionPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "DecisionRecord" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "applicationId" INTEGER NOT NULL,
  "rationale" TEXT NOT NULL,
  "decidedByUserId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DecisionRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT,
  CONSTRAINT "DecisionRecord_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "JobTemplate" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT,
  CONSTRAINT "JobTemplate_companyId_name_key" UNIQUE ("companyId", "name")
);

CREATE TABLE IF NOT EXISTS "PipelineStageTemplate" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "stages" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PipelineStageTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT,
  CONSTRAINT "PipelineStageTemplate_companyId_name_key" UNIQUE ("companyId", "name")
);

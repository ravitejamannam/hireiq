-- Additive only. No existing column, row, or constraint is changed or dropped.

CREATE TYPE "PracticalScoreSource" AS ENUM ('HUMAN', 'AI_SUGGESTED');

ALTER TABLE "CodingTest" ADD COLUMN "allowedResources" TEXT,
ADD COLUMN "assignedAt" TIMESTAMP(3),
ADD COLUMN "compensationNote" TEXT,
ADD COLUMN "dueAt" TIMESTAMP(3),
ADD COLUMN "estimatedMinutes" INTEGER,
ADD COLUMN "gradedAt" TIMESTAMP(3),
ADD COLUMN "instructions" TEXT,
ADD COLUMN "inviteTokenHash" TEXT,
ADD COLUMN "screeningPolicyId" INTEGER,
ADD COLUMN "submissionText" TEXT,
ADD COLUMN "submissionUrl" TEXT,
ADD COLUMN "submittedAt" TIMESTAMP(3);

ALTER TABLE "GeneratedAssessment" ADD COLUMN "candidateInstructions" TEXT,
ADD COLUMN "drawCount" INTEGER NOT NULL DEFAULT 8;

ALTER TABLE "GeneratedAssessment" ADD CONSTRAINT "GeneratedAssessment_drawCount_range"
  CHECK ("drawCount" BETWEEN 1 AND 12);
ALTER TABLE "GeneratedAssessment" ADD CONSTRAINT "GeneratedAssessment_timeLimit_range"
  CHECK ("timeLimitMinutes" BETWEEN 5 AND 240);

ALTER TABLE "GeneratedAssessmentInvite" ADD COLUMN "gradedAt" TIMESTAMP(3);

-- Existing graded invites finished grading when they were submitted.
UPDATE "GeneratedAssessmentInvite" SET "gradedAt" = "submittedAt"
  WHERE "submittedAt" IS NOT NULL AND "grades" IS NOT NULL;

CREATE TABLE "JobScreeningPolicy" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "basicWeight" INTEGER NOT NULL,
    "practicalWeight" INTEGER NOT NULL,
    "evidenceWeight" INTEGER NOT NULL,
    "basicPassPercent" INTEGER,
    "practicalPassPercent" INTEGER,
    "borderlineBandPercent" INTEGER NOT NULL DEFAULT 5,
    "reviewCapacity" INTEGER NOT NULL DEFAULT 25,
    "practicalTitle" TEXT,
    "practicalInstructions" TEXT,
    "practicalEstimatedMinutes" INTEGER,
    "practicalAllowedResources" TEXT,
    "practicalDeadlineDays" INTEGER NOT NULL DEFAULT 5,
    "practicalCompensationNote" TEXT,
    "practicalRubric" JSONB NOT NULL DEFAULT '[]',
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobScreeningPolicy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JobScreeningPolicy_weights_range" CHECK (
      "basicWeight" BETWEEN 0 AND 100 AND
      "practicalWeight" BETWEEN 0 AND 100 AND
      "evidenceWeight" BETWEEN 0 AND 100 AND
      "basicWeight" + "practicalWeight" + "evidenceWeight" = 100
    ),
    CONSTRAINT "JobScreeningPolicy_thresholds_range" CHECK (
      ("basicPassPercent" IS NULL OR "basicPassPercent" BETWEEN 0 AND 100) AND
      ("practicalPassPercent" IS NULL OR "practicalPassPercent" BETWEEN 0 AND 100) AND
      "borderlineBandPercent" BETWEEN 0 AND 25
    ),
    CONSTRAINT "JobScreeningPolicy_capacity_range" CHECK ("reviewCapacity" BETWEEN 1 AND 1000),
    CONSTRAINT "JobScreeningPolicy_deadline_range" CHECK ("practicalDeadlineDays" BETWEEN 1 AND 30)
);

CREATE TABLE "PracticalCriterionScore" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "codingTestId" INTEGER NOT NULL,
    "criterionKey" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "maxPoints" INTEGER NOT NULL,
    "source" "PracticalScoreSource" NOT NULL,
    "rationale" TEXT,
    "evidenceQuote" TEXT,
    "gradedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticalCriterionScore_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PracticalCriterionScore_points_range" CHECK ("maxPoints" > 0 AND "points" BETWEEN 0 AND "maxPoints"),
    CONSTRAINT "PracticalCriterionScore_human_grader" CHECK ("source" <> 'HUMAN' OR "gradedByUserId" IS NOT NULL)
);

CREATE TABLE "StageReminder" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageReminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JobScreeningPolicy_companyId_jobId_idx" ON "JobScreeningPolicy"("companyId", "jobId");
CREATE UNIQUE INDEX "JobScreeningPolicy_jobId_version_key" ON "JobScreeningPolicy"("jobId", "version");
CREATE INDEX "PracticalCriterionScore_codingTestId_criterionKey_createdAt_idx" ON "PracticalCriterionScore"("codingTestId", "criterionKey", "createdAt");
CREATE INDEX "PracticalCriterionScore_companyId_idx" ON "PracticalCriterionScore"("companyId");
CREATE INDEX "StageReminder_companyId_applicationId_idx" ON "StageReminder"("companyId", "applicationId");
CREATE UNIQUE INDEX "StageReminder_targetType_targetId_kind_key" ON "StageReminder"("targetType", "targetId", "kind");
CREATE UNIQUE INDEX "CodingTest_inviteTokenHash_key" ON "CodingTest"("inviteTokenHash");
CREATE INDEX "CodingTest_screeningPolicyId_idx" ON "CodingTest"("screeningPolicyId");

ALTER TABLE "CodingTest" ADD CONSTRAINT "CodingTest_screeningPolicyId_fkey" FOREIGN KEY ("screeningPolicyId") REFERENCES "JobScreeningPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobScreeningPolicy" ADD CONSTRAINT "JobScreeningPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobScreeningPolicy" ADD CONSTRAINT "JobScreeningPolicy_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobScreeningPolicy" ADD CONSTRAINT "JobScreeningPolicy_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PracticalCriterionScore" ADD CONSTRAINT "PracticalCriterionScore_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PracticalCriterionScore" ADD CONSTRAINT "PracticalCriterionScore_codingTestId_fkey" FOREIGN KEY ("codingTestId") REFERENCES "CodingTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PracticalCriterionScore" ADD CONSTRAINT "PracticalCriterionScore_gradedByUserId_fkey" FOREIGN KEY ("gradedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StageReminder" ADD CONSTRAINT "StageReminder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StageReminder" ADD CONSTRAINT "StageReminder_applicationId_companyId_fkey" FOREIGN KEY ("applicationId", "companyId") REFERENCES "Application"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Candidate-taken MCQ assessments after hosted apply.
-- Not interviewer CodingTest records. Not JobRankingRun.

CREATE TYPE "AssessmentAttemptStatus" AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'EXPIRED'
);

CREATE TABLE "AssessmentBankQuestion" (
  "id" SERIAL NOT NULL,
  "roleCategory" "RoleCategory" NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "prompt" TEXT NOT NULL,
  "choices" JSONB NOT NULL,
  "correctIndex" INTEGER NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 1,
  "skillTag" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AssessmentBankQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssessmentBankQuestion_roleCategory_sortOrder_key"
  ON "AssessmentBankQuestion"("roleCategory", "sortOrder");

CREATE INDEX "AssessmentBankQuestion_roleCategory_idx"
  ON "AssessmentBankQuestion"("roleCategory");

CREATE TABLE "AssessmentInvite" (
  "id" SERIAL NOT NULL,
  "applicationId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "roleCategory" "RoleCategory" NOT NULL,
  "questionIds" INTEGER[],
  "scoringKey" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AssessmentInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssessmentInvite_applicationId_key"
  ON "AssessmentInvite"("applicationId");

CREATE UNIQUE INDEX "AssessmentInvite_tokenHash_key"
  ON "AssessmentInvite"("tokenHash");

CREATE INDEX "AssessmentInvite_expiresAt_idx"
  ON "AssessmentInvite"("expiresAt");

ALTER TABLE "AssessmentInvite"
  ADD CONSTRAINT "AssessmentInvite_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AssessmentAttempt" (
  "id" SERIAL NOT NULL,
  "inviteId" INTEGER NOT NULL,
  "status" "AssessmentAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "score" INTEGER NOT NULL DEFAULT 0,
  "maxScore" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssessmentAttempt_inviteId_key"
  ON "AssessmentAttempt"("inviteId");

ALTER TABLE "AssessmentAttempt"
  ADD CONSTRAINT "AssessmentAttempt_inviteId_fkey"
  FOREIGN KEY ("inviteId") REFERENCES "AssessmentInvite"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AssessmentAnswer" (
  "id" SERIAL NOT NULL,
  "attemptId" INTEGER NOT NULL,
  "questionId" INTEGER NOT NULL,
  "selectedIndex" INTEGER NOT NULL,
  "isCorrect" BOOLEAN NOT NULL,
  "weight" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AssessmentAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssessmentAnswer_attemptId_questionId_key"
  ON "AssessmentAnswer"("attemptId", "questionId");

CREATE INDEX "AssessmentAnswer_attemptId_idx"
  ON "AssessmentAnswer"("attemptId");

ALTER TABLE "AssessmentAnswer"
  ADD CONSTRAINT "AssessmentAnswer_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssessmentAnswer"
  ADD CONSTRAINT "AssessmentAnswer_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "AssessmentBankQuestion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "EvaluationFitDecision" AS ENUM ('RIGHT_FIT', 'NOT_FIT');

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" SERIAL NOT NULL,
    "overallScore" INTEGER,
    "scorecard" JSONB,
    "notes" TEXT,
    "recordingUrl" TEXT,
    "recommendation" "Recommendation",
    "hireProbability" TEXT,
    "fitDecision" "EvaluationFitDecision",
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "interviewerId" INTEGER NOT NULL,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationQuestion" (
    "id" SERIAL NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "expertComment" TEXT,
    "score" INTEGER,
    "difficulty" TEXT,
    "weight" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "evaluationId" INTEGER NOT NULL,

    CONSTRAINT "EvaluationQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Evaluation_applicationId_idx" ON "Evaluation"("applicationId");

-- CreateIndex
CREATE INDEX "Evaluation_interviewerId_idx" ON "Evaluation"("interviewerId");

-- CreateIndex
CREATE INDEX "EvaluationQuestion_evaluationId_idx" ON "EvaluationQuestion"("evaluationId");

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "Interviewer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationQuestion" ADD CONSTRAINT "EvaluationQuestion_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

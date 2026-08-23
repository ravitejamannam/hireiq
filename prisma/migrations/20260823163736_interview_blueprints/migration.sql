-- CreateTable
CREATE TABLE "InterviewBlueprint" (
    "id" SERIAL NOT NULL,
    "jobSpecificationVersionId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlueprintCompetency" (
    "id" SERIAL NOT NULL,
    "blueprintId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BlueprintCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlueprintQuestion" (
    "id" SERIAL NOT NULL,
    "blueprintId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "guidance" TEXT,
    "difficulty" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BlueprintQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationCompetencyScore" (
    "id" SERIAL NOT NULL,
    "evaluationId" INTEGER NOT NULL,
    "competencyName" TEXT NOT NULL,
    "weightSnapshot" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "EvaluationCompetencyScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewBlueprint_jobSpecificationVersionId_key" ON "InterviewBlueprint"("jobSpecificationVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintCompetency_blueprintId_name_key" ON "BlueprintCompetency"("blueprintId", "name");

-- CreateIndex
CREATE INDEX "BlueprintQuestion_blueprintId_active_idx" ON "BlueprintQuestion"("blueprintId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationCompetencyScore_evaluationId_competencyName_key" ON "EvaluationCompetencyScore"("evaluationId", "competencyName");

-- AddForeignKey
ALTER TABLE "InterviewBlueprint" ADD CONSTRAINT "InterviewBlueprint_jobSpecificationVersionId_fkey" FOREIGN KEY ("jobSpecificationVersionId") REFERENCES "JobSpecificationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintCompetency" ADD CONSTRAINT "BlueprintCompetency_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "InterviewBlueprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintQuestion" ADD CONSTRAINT "BlueprintQuestion_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "InterviewBlueprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintQuestion" ADD CONSTRAINT "BlueprintQuestion_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "BlueprintCompetency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCompetencyScore" ADD CONSTRAINT "EvaluationCompetencyScore_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

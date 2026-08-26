-- T134: difficulty tiers unlock adaptive selection.
CREATE TYPE "QuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
ALTER TABLE "AssessmentBankQuestion" ADD COLUMN "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'MEDIUM';

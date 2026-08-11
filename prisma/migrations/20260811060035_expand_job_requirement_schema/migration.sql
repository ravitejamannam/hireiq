-- CreateEnum
CREATE TYPE "RequirementLifecycle" AS ENUM ('REQUIREMENT_DRAFTED', 'CLIENT_NOTIFIED', 'REQUIREMENT_POSTED', 'INTERVIEWER_NOTIFIED', 'SOURCING_SHORTLISTING', 'BILLING_GENERATED');

-- CreateEnum
CREATE TYPE "RoleCategory" AS ENUM ('ENGINEERING', 'SALES', 'DESIGN', 'FINANCE');

-- CreateEnum
CREATE TYPE "SourcingDatabaseSource" AS ENUM ('LINKEDIN', 'NAUKRI');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "clientCompletedAt" TIMESTAMP(3),
ADD COLUMN     "compensationRange" TEXT,
ADD COLUMN     "evaluationCriteria" TEXT,
ADD COLUMN     "experienceRange" TEXT,
ADD COLUMN     "jobDescription" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "mustHaveRequirements" TEXT,
ADD COLUMN     "niceToHaveRequirements" TEXT,
ADD COLUMN     "numberOfPositions" INTEGER,
ADD COLUMN     "primarySkills" TEXT,
ADD COLUMN     "requirementLifecycle" "RequirementLifecycle" NOT NULL DEFAULT 'REQUIREMENT_DRAFTED',
ADD COLUMN     "roleCategory" "RoleCategory",
ADD COLUMN     "shortlistingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "shortlistingDueAt" TIMESTAMP(3),
ADD COLUMN     "sourcingAccessDetails" TEXT,
ADD COLUMN     "sourcingAccessReceivedAt" TIMESTAMP(3),
ADD COLUMN     "sourcingDatabaseSource" "SourcingDatabaseSource",
ADD COLUMN     "targetHireDate" TIMESTAMP(3);

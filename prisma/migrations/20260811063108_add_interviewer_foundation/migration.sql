-- CreateEnum
CREATE TYPE "InterviewerAvailability" AS ENUM ('AVAILABLE', 'NOT_AVAILABLE');

-- CreateEnum
CREATE TYPE "InterviewerCategory" AS ENUM ('ENGINEERING', 'DATA_SCIENCE', 'PRODUCT', 'DESIGN');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "assignedInterviewerId" INTEGER;

-- CreateTable
CREATE TABLE "Interviewer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" "InterviewerCategory" NOT NULL,
    "availability" "InterviewerAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interviewer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_assignedInterviewerId_idx" ON "Job"("assignedInterviewerId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_assignedInterviewerId_fkey" FOREIGN KEY ("assignedInterviewerId") REFERENCES "Interviewer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

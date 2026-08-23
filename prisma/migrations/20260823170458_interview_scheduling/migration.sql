-- CreateEnum
CREATE TYPE "InterviewSlotStatus" AS ENUM ('OPEN', 'BOOKED', 'CANCELLED');

-- CreateTable
CREATE TABLE "InterviewSlot" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "interviewerId" INTEGER NOT NULL,
    "interviewType" "InterviewType" NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 45,
    "status" "InterviewSlotStatus" NOT NULL DEFAULT 'OPEN',
    "bookedApplicationId" INTEGER,

    CONSTRAINT "InterviewSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewBookingInvite" (
    "id" SERIAL NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewBookingInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewSlot_jobId_status_startAt_idx" ON "InterviewSlot"("jobId", "status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewSlot_interviewerId_startAt_key" ON "InterviewSlot"("interviewerId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewBookingInvite_applicationId_key" ON "InterviewBookingInvite"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewBookingInvite_tokenHash_key" ON "InterviewBookingInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "InterviewBookingInvite_expiresAt_idx" ON "InterviewBookingInvite"("expiresAt");

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "Interviewer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewBookingInvite" ADD CONSTRAINT "InterviewBookingInvite_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

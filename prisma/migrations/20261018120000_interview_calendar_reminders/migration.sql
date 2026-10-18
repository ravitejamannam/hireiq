ALTER TABLE "Interview" ADD COLUMN "calendarEventId" TEXT;
ALTER TABLE "Interview" ADD COLUMN "meetUrl" TEXT;

CREATE TABLE "InterviewReminder" (
  "id" SERIAL NOT NULL,
  "interviewId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "sendAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterviewReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InterviewReminder_interviewId_kind_key" ON "InterviewReminder"("interviewId", "kind");
CREATE INDEX "InterviewReminder_sentAt_sendAt_idx" ON "InterviewReminder"("sentAt", "sendAt");

ALTER TABLE "InterviewReminder" ADD CONSTRAINT "InterviewReminder_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

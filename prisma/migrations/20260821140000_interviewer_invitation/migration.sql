-- Admin-invited interviewer logins. Separate from company Invitation.

CREATE TABLE "InterviewerInvitation" (
  "id" SERIAL NOT NULL,
  "interviewerId" INTEGER NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "invitedByUserId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InterviewerInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InterviewerInvitation_tokenHash_key"
  ON "InterviewerInvitation"("tokenHash");

CREATE INDEX "InterviewerInvitation_interviewerId_idx"
  ON "InterviewerInvitation"("interviewerId");

CREATE INDEX "InterviewerInvitation_email_idx"
  ON "InterviewerInvitation"("email");

CREATE INDEX "InterviewerInvitation_expiresAt_idx"
  ON "InterviewerInvitation"("expiresAt");

ALTER TABLE "InterviewerInvitation"
  ADD CONSTRAINT "InterviewerInvitation_interviewerId_fkey"
  FOREIGN KEY ("interviewerId") REFERENCES "Interviewer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InterviewerInvitation"
  ADD CONSTRAINT "InterviewerInvitation_invitedByUserId_fkey"
  FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hiring desk: ingestion-backed funnel timestamps, interview round plan,
-- offer terms / decline / join date, optional public application counts.

ALTER TABLE "Company"
ADD COLUMN "publishApplicationCount" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Job"
ADD COLUMN "interviewRoundPlan" "InterviewType"[] NOT NULL DEFAULT ARRAY[]::"InterviewType"[];

ALTER TABLE "Application"
ADD COLUMN "shortlistedAt" TIMESTAMP(3),
ADD COLUMN "offerMintedAt" TIMESTAMP(3),
ADD COLUMN "offerDeclinedAt" TIMESTAMP(3),
ADD COLUMN "offerTerms" TEXT,
ADD COLUMN "offerCompensation" TEXT,
ADD COLUMN "proposedStartDate" TIMESTAMP(3);

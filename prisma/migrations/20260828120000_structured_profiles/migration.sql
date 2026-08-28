-- Structured career sections for candidate profiles (from hosted apply)
-- and interviewer profiles (filled manually in the interviewer portal).
-- Additive. Does not alter identity, pipeline, matching, or ranking.

ALTER TABLE "CandidateProfile"
ADD COLUMN "aboutText" TEXT,
ADD COLUMN "roleTitle" TEXT,
ADD COLUMN "domains" JSONB,
ADD COLUMN "githubUrl" TEXT,
ADD COLUMN "portfolioUrl" TEXT,
ADD COLUMN "twitterUrl" TEXT,
ADD COLUMN "videoResumeUrl" TEXT,
ADD COLUMN "experiences" JSONB,
ADD COLUMN "education" JSONB,
ADD COLUMN "projects" JSONB;

ALTER TABLE "HostedApplySubmission"
ADD COLUMN "profilePayload" JSONB;

CREATE TABLE "InterviewerProfile" (
    "id" SERIAL NOT NULL,
    "interviewerId" INTEGER NOT NULL,
    "headline" TEXT,
    "location" TEXT,
    "aboutText" TEXT,
    "roleTitle" TEXT,
    "experienceYears" INTEGER,
    "domains" JSONB,
    "linkedInUrl" TEXT,
    "githubUrl" TEXT,
    "portfolioUrl" TEXT,
    "twitterUrl" TEXT,
    "videoUrl" TEXT,
    "experiences" JSONB,
    "education" JSONB,
    "projects" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewerProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InterviewerProfile_interviewerId_key" ON "InterviewerProfile"("interviewerId");

ALTER TABLE "InterviewerProfile"
ADD CONSTRAINT "InterviewerProfile_interviewerId_fkey"
FOREIGN KEY ("interviewerId") REFERENCES "Interviewer"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- T89: CandidateProfile 1:1 descriptive profile.
-- Additive. Does not alter Candidate identity, Application pipeline,
-- Application.source, SourcingDatabaseSource, ingestion, or JWT.
-- Does not copy Candidate.role into headline (T85–T87 may store Job.title there).
-- Does not copy Candidate.status.

-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" SERIAL NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "headline" TEXT,
    "location" TEXT,
    "experienceYears" INTEGER,
    "skillsText" TEXT,
    "currentEmployer" TEXT,
    "expectedCTC" TEXT,
    "linkedInUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateProfile_candidateId_key" ON "CandidateProfile"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateProfile_candidateId_companyId_key" ON "CandidateProfile"("candidateId", "companyId");

-- CreateIndex
CREATE INDEX "CandidateProfile_companyId_idx" ON "CandidateProfile"("companyId");

-- AddForeignKey
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Safe backfill from existing Candidate descriptive columns only.
-- headline and linkedInUrl stay NULL. role and status are not copied.
INSERT INTO "CandidateProfile" (
    "candidateId",
    "companyId",
    "location",
    "experienceYears",
    "skillsText",
    "currentEmployer",
    "expectedCTC",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "companyId",
    "location",
    "experienceYears",
    "skills",
    "currentEmployer",
    "expectedCTC",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Candidate"
ON CONFLICT ("candidateId") DO NOTHING;

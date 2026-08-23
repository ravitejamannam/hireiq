-- CreateEnum
CREATE TYPE "ResumeParseStatus" AS ENUM ('PENDING', 'PARSED', 'FAILED');

-- AlterEnum
ALTER TYPE "CandidateEvidenceSourceType" ADD VALUE 'RESUME_DOCUMENT';

-- CreateTable
CREATE TABLE "CandidateResumeDocument" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "applicationId" INTEGER,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "parseStatus" "ResumeParseStatus" NOT NULL DEFAULT 'PENDING',
    "extractedText" TEXT,
    "extractorVersion" TEXT,
    "parseErrorCode" TEXT,
    "uploadedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateResumeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateResumeDocument_storageKey_key" ON "CandidateResumeDocument"("storageKey");

-- CreateIndex
CREATE INDEX "CandidateResumeDocument_companyId_candidateId_idx" ON "CandidateResumeDocument"("companyId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateResumeDocument_companyId_contentSha256_key" ON "CandidateResumeDocument"("companyId", "contentSha256");

-- AddForeignKey
ALTER TABLE "CandidateResumeDocument" ADD CONSTRAINT "CandidateResumeDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateResumeDocument" ADD CONSTRAINT "CandidateResumeDocument_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateResumeDocument" ADD CONSTRAINT "CandidateResumeDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateResumeDocument" ADD CONSTRAINT "CandidateResumeDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

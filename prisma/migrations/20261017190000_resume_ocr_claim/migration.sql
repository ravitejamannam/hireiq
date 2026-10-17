-- Claim lock and retry count for background resume OCR.
ALTER TABLE "CandidateResumeDocument"
  ADD COLUMN "ocrAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ocrClaimedAt" TIMESTAMP(3);

ALTER TABLE "HostedApplyResumeUpload"
  ADD COLUMN "ocrAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ocrClaimedAt" TIMESTAMP(3);

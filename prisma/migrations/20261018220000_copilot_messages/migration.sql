CREATE TABLE IF NOT EXISTS "CopilotMessage" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "jobId" INTEGER,
  "userId" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "citations" JSONB NOT NULL,
  "toolCalls" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CopilotMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "CopilotMessage_companyId_jobId_createdAt_idx" ON "CopilotMessage"("companyId", "jobId", "createdAt");

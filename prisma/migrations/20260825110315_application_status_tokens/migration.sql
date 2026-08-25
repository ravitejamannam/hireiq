-- AlterTable
ALTER TABLE "Application" ADD COLUMN "statusTokenHash" TEXT;
ALTER TABLE "Application" ADD COLUMN "statusLinkSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Application_statusTokenHash_key" ON "Application"("statusTokenHash");

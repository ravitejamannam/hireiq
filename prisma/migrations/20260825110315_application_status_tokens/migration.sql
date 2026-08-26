-- AlterTable
ALTER TABLE "Application" ADD COLUMN "statusTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Application_statusTokenHash_key" ON "Application"("statusTokenHash");

-- CreateEnum
CREATE TYPE "ReconciliationOutcome" AS ENUM ('OK', 'DRIFT', 'ERROR', 'SKIPPED');

-- CreateTable
CREATE TABLE "DistributionReconciliationRun" (
    "id" SERIAL NOT NULL,
    "batchId" TEXT NOT NULL,
    "distributionId" INTEGER NOT NULL,
    "provider" "DistributionProvider" NOT NULL,
    "outcome" "ReconciliationOutcome" NOT NULL,
    "expectedStatus" "ProviderPostingStatus",
    "observedStatus" "ProviderPostingStatus",
    "finding" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributionReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DistributionReconciliationRun_batchId_idx" ON "DistributionReconciliationRun"("batchId");

-- CreateIndex
CREATE INDEX "DistributionReconciliationRun_distributionId_checkedAt_idx" ON "DistributionReconciliationRun"("distributionId", "checkedAt");

-- AddForeignKey
ALTER TABLE "DistributionReconciliationRun" ADD CONSTRAINT "DistributionReconciliationRun_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "JobDistribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

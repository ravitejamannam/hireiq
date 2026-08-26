-- CreateTable
CREATE TABLE "PartnerWebhookSubscription" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerWebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerWebhookSubscription_companyId_active_idx" ON "PartnerWebhookSubscription"("companyId", "active");

-- AddForeignKey
ALTER TABLE "PartnerWebhookSubscription" ADD CONSTRAINT "PartnerWebhookSubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

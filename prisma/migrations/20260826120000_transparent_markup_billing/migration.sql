-- T132: transparent markup billing (Bullhorn model, math shown to clients).
ALTER TABLE "Company" ADD COLUMN "agencyMarkupBps" INTEGER;

ALTER TABLE "BillingLineItem" ADD COLUMN "placedCtcCents" INTEGER;
ALTER TABLE "BillingLineItem" ADD COLUMN "markupBps" INTEGER;
ALTER TABLE "BillingLineItem" ADD COLUMN "feeCents" INTEGER;
ALTER TABLE "BillingLineItem" ADD COLUMN "compensationRecordedAt" TIMESTAMP(3);

-- T133: HMAC-signed offer acceptance.
ALTER TABLE "Application" ADD COLUMN "offerAcceptanceTokenHash" TEXT;
ALTER TABLE "Application" ADD COLUMN "offerAcceptedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Application_offerAcceptanceTokenHash_key" ON "Application"("offerAcceptanceTokenHash");

-- Ticket 65: Billing line items for SELECTED applications (no fee/amount fields).

CREATE TABLE "BillingLineItem" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "billingRecordId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,

    CONSTRAINT "BillingLineItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingLineItem_applicationId_key" ON "BillingLineItem"("applicationId");
CREATE INDEX "BillingLineItem_billingRecordId_idx" ON "BillingLineItem"("billingRecordId");

ALTER TABLE "BillingLineItem"
  ADD CONSTRAINT "BillingLineItem_billingRecordId_fkey"
  FOREIGN KEY ("billingRecordId") REFERENCES "BillingRecord"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingLineItem"
  ADD CONSTRAINT "BillingLineItem_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Production ops: session revocation, login disable, email + webhook retries.

ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);

CREATE TYPE "OutboundEmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "OutboundEmailAttempt" (
    "id" SERIAL NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "status" "OutboundEmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundEmailAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboundEmailAttempt_status_nextRetryAt_idx" ON "OutboundEmailAttempt"("status", "nextRetryAt");

CREATE TYPE "OutboundWebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

CREATE TABLE "OutboundWebhookDelivery" (
    "id" SERIAL NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "event" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" "OutboundWebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboundWebhookDelivery_status_nextRetryAt_idx" ON "OutboundWebhookDelivery"("status", "nextRetryAt");
CREATE INDEX "OutboundWebhookDelivery_subscriptionId_idx" ON "OutboundWebhookDelivery"("subscriptionId");

ALTER TABLE "OutboundWebhookDelivery" ADD CONSTRAINT "OutboundWebhookDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PartnerWebhookSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

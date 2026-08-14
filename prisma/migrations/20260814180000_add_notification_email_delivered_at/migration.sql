-- T76: persist successful email delivery so retries can skip a second send
-- without treating "notification already exists" as email success.

ALTER TABLE "Notification" ADD COLUMN "emailDeliveredAt" TIMESTAMP(3);

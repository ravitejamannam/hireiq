-- Keep a validated inbound attachment so an authorized retry can parse it again.
-- Records whether a malware scanner ran. No scanner is configured in this migration.

ALTER TABLE "InboundEmailMessage" ADD COLUMN "applicantEmailNormalized" TEXT;
ALTER TABLE "InboundEmailMessage" ADD COLUMN "malwareScan" TEXT;

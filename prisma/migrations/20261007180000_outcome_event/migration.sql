-- Additive M13 outcome events. Does not backfill existing applications.

CREATE TYPE "OutcomeEventType" AS ENUM ('SHORTLISTED', 'SELECTED', 'HIRED', 'REJECTED', 'OFFER_ACCEPTED', 'OFFER_DECLINED');

CREATE TYPE "OutcomeEventActorType" AS ENUM ('ADMIN', 'CLIENT', 'INTERVIEWER', 'PUBLIC_TOKEN');

CREATE TABLE "OutcomeEvent" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "eventType" "OutcomeEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "actorUserId" INTEGER,
    "actorType" "OutcomeEventActorType" NOT NULL,
    "fromStatus" "ApplicationPipelineStatus",
    "toStatus" "ApplicationPipelineStatus",
    "protocolVersion" TEXT NOT NULL,
    CONSTRAINT "OutcomeEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutcomeEvent_id_companyId_key" ON "OutcomeEvent"("id", "companyId");
CREATE INDEX "OutcomeEvent_companyId_applicationId_occurredAt_idx" ON "OutcomeEvent"("companyId", "applicationId", "occurredAt");
CREATE INDEX "OutcomeEvent_companyId_jobId_occurredAt_idx" ON "OutcomeEvent"("companyId", "jobId", "occurredAt");

-- Pipeline edges only. NULL from/to on offer events are excluded.
CREATE UNIQUE INDEX "OutcomeEvent_pipeline_transition_key"
  ON "OutcomeEvent"("applicationId", "fromStatus", "toStatus")
  WHERE "fromStatus" IS NOT NULL AND "toStatus" IS NOT NULL;

-- One acceptance per application. Declines are not unique.
CREATE UNIQUE INDEX "OutcomeEvent_offer_accepted_key"
  ON "OutcomeEvent"("applicationId")
  WHERE "eventType" = 'OFFER_ACCEPTED';

ALTER TABLE "OutcomeEvent" ADD CONSTRAINT "OutcomeEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutcomeEvent" ADD CONSTRAINT "OutcomeEvent_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutcomeEvent" ADD CONSTRAINT "OutcomeEvent_applicationId_companyId_fkey" FOREIGN KEY ("applicationId", "companyId") REFERENCES "Application"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutcomeEvent" ADD CONSTRAINT "OutcomeEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

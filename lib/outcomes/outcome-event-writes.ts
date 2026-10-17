import {
  ApplicationPipelineStatus,
  OutcomeEventActorType,
  OutcomeEventType,
  type Prisma,
} from "@prisma/client";

import { writeAuditLog, auditActionForStatus } from "@/lib/audit/write-audit-log";
import { OUTCOME_EVENT_PROTOCOL_VERSION } from "@/lib/outcomes/outcome-event-versions";
import { shortlistedAtPatch } from "@/lib/hiring/pipeline-timestamps";

type Tx = Prisma.TransactionClient;

const PIPELINE_EVENT_TYPES = {
  [ApplicationPipelineStatus.SHORTLISTED]: OutcomeEventType.SHORTLISTED,
  [ApplicationPipelineStatus.SELECTED]: OutcomeEventType.SELECTED,
  [ApplicationPipelineStatus.HIRED]: OutcomeEventType.HIRED,
  [ApplicationPipelineStatus.REJECTED]: OutcomeEventType.REJECTED,
} as const;

export type PipelineEventStatus = keyof typeof PIPELINE_EVENT_TYPES;

export function isPipelineOutcomeStatus(
  status: ApplicationPipelineStatus,
): status is PipelineEventStatus {
  return status in PIPELINE_EVENT_TYPES;
}

/**
 * Compare-and-swap a pipeline status and, when the winning write is a V1
 * outcome, insert one OutcomeEvent in the same transaction.
 * Returns null when this caller lost the race.
 */
export async function commitApplicationStatusChange(
  tx: Tx,
  input: {
    applicationId: number;
    expectedStatus: ApplicationPipelineStatus;
    nextStatus: ApplicationPipelineStatus;
    actorUserId: number;
    actorType: Exclude<OutcomeEventActorType, "PUBLIC_TOKEN">;
    actorRole?: string;
    patch?: {
      source?: Prisma.ApplicationUpdateManyMutationInput["source"];
      expertScore?: number | null;
      rejectionReason?: string | null;
      candidateId?: number;
      jobId?: number;
      companyId?: number;
    };
  },
) {
  const row = await tx.application.findFirst({
    where: {
      id: input.applicationId,
      status: input.expectedStatus,
    },
    select: {
      id: true,
      companyId: true,
      jobId: true,
      status: true,
      shortlistedAt: true,
    },
  });

  if (!row) return null;

  const now = new Date();
  const shortlist = shortlistedAtPatch(input.nextStatus, row.shortlistedAt);
  const data: Prisma.ApplicationUpdateManyMutationInput = {
    status: input.nextStatus,
    ...(input.patch?.source !== undefined ? { source: input.patch.source } : {}),
    ...(input.patch?.expertScore !== undefined
      ? { expertScore: input.patch.expertScore }
      : {}),
    ...(input.patch?.rejectionReason !== undefined
      ? { rejectionReason: input.patch.rejectionReason }
      : {}),
    ...(shortlist.shortlistedAt ? { shortlistedAt: now } : {}),
  };

  const updated = await tx.application.updateMany({
    where: {
      id: row.id,
      status: input.expectedStatus,
      companyId: row.companyId,
    },
    data,
  });

  if (updated.count !== 1) return null;

  if (row.status !== input.nextStatus) {
    const reason =
      typeof input.patch?.rejectionReason === "string"
        ? input.patch.rejectionReason
        : null;
    await writeAuditLog(tx, {
      actorUserId: input.actorUserId,
      actorRole: input.actorRole ?? input.actorType,
      companyId: row.companyId,
      action: auditActionForStatus(input.nextStatus),
      targetType: "APPLICATION",
      targetId: row.id,
      reason,
    });
  }

  if (
    input.patch?.candidateId !== undefined ||
    input.patch?.jobId !== undefined ||
    input.patch?.companyId !== undefined
  ) {
    await tx.application.update({
      where: { id: row.id },
      data: {
        ...(input.patch.candidateId !== undefined
          ? { candidateId: input.patch.candidateId }
          : {}),
        ...(input.patch.jobId !== undefined ? { jobId: input.patch.jobId } : {}),
        ...(input.patch.companyId !== undefined
          ? { companyId: input.patch.companyId }
          : {}),
      },
    });
  }

  const statusChanged = row.status !== input.nextStatus;
  const firstShortlist =
    statusChanged &&
    input.nextStatus === ApplicationPipelineStatus.SHORTLISTED &&
    row.shortlistedAt == null;

  if (
    statusChanged &&
    isPipelineOutcomeStatus(input.nextStatus) &&
    (input.nextStatus !== ApplicationPipelineStatus.SHORTLISTED ||
      firstShortlist)
  ) {
    const fresh = await tx.application.findFirst({
      where: { id: row.id },
      select: { companyId: true, jobId: true },
    });
    if (!fresh) {
      throw new Error("Outcome event tenant does not match the application.");
    }

    await tx.outcomeEvent.create({
      data: {
        companyId: fresh.companyId,
        jobId: fresh.jobId,
        applicationId: row.id,
        eventType: PIPELINE_EVENT_TYPES[input.nextStatus],
        occurredAt: now,
        actorUserId: input.actorUserId,
        actorType: input.actorType,
        fromStatus: row.status,
        toStatus: input.nextStatus,
        protocolVersion: OUTCOME_EVENT_PROTOCOL_VERSION,
      },
    });
  }

  return tx.application.findUniqueOrThrow({
    where: { id: row.id },
  });
}

export async function commitOfferDecision(
  tx: Tx,
  input: {
    applicationId: number;
    decision: "ACCEPTED" | "DECLINED";
    occurredAt: Date;
  },
) {
  const updated = await tx.application.updateMany({
    where: {
      id: input.applicationId,
      offerAcceptedAt: null,
      offerDeclinedAt: null,
    },
    data:
      input.decision === "ACCEPTED"
        ? { offerAcceptedAt: input.occurredAt }
        : { offerDeclinedAt: input.occurredAt },
  });

  if (updated.count !== 1) return 0;

  const row = await tx.application.findFirst({
    where: { id: input.applicationId },
    select: { id: true, companyId: true, jobId: true },
  });
  if (!row) {
    throw new Error("Outcome event tenant does not match the application.");
  }

  await tx.outcomeEvent.create({
    data: {
      companyId: row.companyId,
      jobId: row.jobId,
      applicationId: row.id,
      eventType:
        input.decision === "ACCEPTED"
          ? OutcomeEventType.OFFER_ACCEPTED
          : OutcomeEventType.OFFER_DECLINED,
      occurredAt: input.occurredAt,
      actorUserId: null,
      actorType: OutcomeEventActorType.PUBLIC_TOKEN,
      fromStatus: null,
      toStatus: null,
      protocolVersion: OUTCOME_EVENT_PROTOCOL_VERSION,
    },
  });

  return 1;
}

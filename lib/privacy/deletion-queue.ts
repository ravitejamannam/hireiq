import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";
import { eraseCandidate } from "@/lib/privacy/candidate-erasure";

/** Internal aim. A week or two, not the legal maximum. */
export const DELETION_TARGET_DAYS = 14;

/** DPDP Rules, 2025, rule 14(3). Overdue alarm only. Not the day to aim for. */
export const DELETION_CEILING_DAYS = 90;

function addDays(createdAt: Date, days: number) {
  const due = new Date(createdAt);
  due.setUTCDate(due.getUTCDate() + days);
  return due;
}

export function deletionTargetAt(createdAt: Date) {
  return addDays(createdAt, DELETION_TARGET_DAYS);
}

export function deletionCeilingAt(createdAt: Date) {
  return addDays(createdAt, DELETION_CEILING_DAYS);
}

export function deletionPastAim(input: { createdAt: Date; status: string; now?: Date }) {
  if (input.status !== "QUEUED") return false;
  return (input.now ?? new Date()).getTime() > deletionTargetAt(input.createdAt).getTime();
}

export function deletionIsOverdue(input: { createdAt: Date; status: string; now?: Date }) {
  if (input.status !== "QUEUED") return false;
  return (input.now ?? new Date()).getTime() > deletionCeilingAt(input.createdAt).getTime();
}

export async function listDeletionRequests() {
  const rows = await prisma.candidateDeletionRequest.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      candidate: { select: { name: true } },
      company: { select: { name: true } },
      application: { select: { id: true, job: { select: { title: true } } } },
    },
  });
  return rows.map((row) => ({
    ...row,
    targetAt: deletionTargetAt(row.createdAt),
    ceilingAt: deletionCeilingAt(row.createdAt),
    pastAim: deletionPastAim({ createdAt: row.createdAt, status: row.status }),
    overdue: deletionIsOverdue({ createdAt: row.createdAt, status: row.status }),
  }));
}

export async function completeDeletionRequest(input: { requestId: number; actorUserId: number }) {
  const request = await prisma.candidateDeletionRequest.findUnique({ where: { id: input.requestId } });
  if (!request || request.status !== "QUEUED") throw new Error("This request is already decided.");
  const result = await eraseCandidate({
    companyId: request.companyId,
    candidateId: request.candidateId,
    trigger: "DELETION_QUEUE",
    requestedByUserId: input.actorUserId,
  });
  if (result.status !== "COMPLETED") {
    // Stays QUEUED. The retry job repeats the failed steps, and completing again is safe.
    throw new Error(`Erasure is incomplete (${result.failedSteps.join(", ")}). It will be retried. Complete the request again once it finishes.`);
  }
  await prisma.candidateDeletionRequest.updateMany({
    where: { candidateId: request.candidateId, companyId: request.companyId },
    data: { emailNormalized: "erased" },
  });
  await prisma.candidateDeletionRequest.update({
    where: { id: request.id },
    data: {
      status: "COMPLETED",
      decidedAt: new Date(),
      decidedByUserId: input.actorUserId,
      decisionReason: "Personal data erased. Hiring records kept where the law requires them.",
    },
  });
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: request.companyId,
    action: "DELETION_COMPLETED",
    targetType: "CANDIDATE",
    targetId: request.candidateId,
    reason: `request ${request.id}`,
  });
}

export async function retainDeletionRequest(input: { requestId: number; actorUserId: number; reason: string }) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("A retention reason is required.");
  const request = await prisma.candidateDeletionRequest.findUnique({ where: { id: input.requestId } });
  if (!request || request.status !== "QUEUED") throw new Error("This request is already decided.");
  await prisma.candidateDeletionRequest.update({
    where: { id: request.id },
    data: {
      status: "RETAINED",
      decidedAt: new Date(),
      decidedByUserId: input.actorUserId,
      decisionReason: reason.slice(0, 500),
    },
  });
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: request.companyId,
    action: "DELETION_RETAINED",
    targetType: "CANDIDATE",
    targetId: request.candidateId,
    // The decision reason is stored on the request. The append-only log keeps only the outcome.
    reason: "retained | reason recorded on the request",
  });
}

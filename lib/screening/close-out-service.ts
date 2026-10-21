import { ApplicationPipelineStatus } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { notifyCandidateOfStageChange } from "@/lib/candidates/stage-change-emails";
import { prisma } from "@/lib/prisma";
import { isReviewRejectReason } from "@/lib/review/review-queue";
import { applyReviewDecision } from "@/lib/review/review-queue-service";
import type { Category } from "@/lib/screening/prioritization";
import { loadScreeningPool } from "@/lib/screening/screening-data";

/**
 * Bulk close-out is two separate human steps: a recruiter proposes a frozen
 * list, then a recruiter approves it by confirming the exact count. Nothing
 * changes at proposal time, and no screening category closes anyone by itself.
 */

export const CLOSE_OUT_MAX = 1000;
export const CLOSE_OUT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CLOSE_OUT_CATEGORIES = ["WEAK_EVIDENCE", "NOT_MET", "POSSIBLE_FIT"] as const satisfies readonly Category[];
export type CloseOutCategory = (typeof CLOSE_OUT_CATEGORIES)[number];

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const CLOSED_STATUSES = new Set<ApplicationPipelineStatus>([ApplicationPipelineStatus.REJECTED, ApplicationPipelineStatus.HIRED]);

function idsOf(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((id): id is number => Number.isInteger(id) && id > 0) : [];
}

export async function proposeCloseOut(input: {
  jobId: number;
  companyId: number;
  actorUserId: number;
  reason: string;
  applicationIds?: number[];
  category?: CloseOutCategory;
}): Promise<Result<{ id: number; count: number; skippedHumanReview: number; skippedClosed: number }>> {
  if (!isReviewRejectReason(input.reason)) return { ok: false, error: "Choose a rejection reason." };
  const pool = await loadScreeningPool(input.jobId, input.companyId);
  if (!pool) return { ok: false, error: "Job not found." };

  let candidates = pool.rows;
  if (input.category) {
    if (!(CLOSE_OUT_CATEGORIES as readonly string[]).includes(input.category)) {
      return { ok: false, error: "That category cannot be closed out in bulk." };
    }
    candidates = candidates.filter((row) => row.evaluation.category === input.category);
  } else {
    const wanted = new Set(idsOf(input.applicationIds));
    if (wanted.size === 0) return { ok: false, error: "Select candidates or a category." };
    candidates = candidates.filter((row) => wanted.has(row.applicationId));
  }
  const skippedClosed = candidates.filter((row) => row.closed || CLOSED_STATUSES.has(row.status)).length;
  const open = candidates.filter((row) => !row.closed && !CLOSED_STATUSES.has(row.status));
  const skippedHumanReview = open.filter((row) => row.humanReview).length;
  const ids = open.filter((row) => !row.humanReview).map((row) => row.applicationId);
  if (ids.length === 0) return { ok: false, error: "No open candidates to close out." };
  if (ids.length > CLOSE_OUT_MAX) return { ok: false, error: `A close-out is limited to ${CLOSE_OUT_MAX} candidates.` };

  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.closeOutBatch.create({
      data: {
        companyId: input.companyId,
        jobId: input.jobId,
        category: input.category ?? "SELECTED",
        reason: input.reason,
        applicationIds: ids,
        proposedByUserId: input.actorUserId,
      },
      select: { id: true },
    });
    await writeAuditLog(tx, {
      actorUserId: input.actorUserId,
      actorRole: "ADMIN",
      companyId: input.companyId,
      action: "CLOSE_OUT_PROPOSED",
      targetType: "CLOSE_OUT_BATCH",
      targetId: created.id,
      // The recruiter's reason is stored on the batch. The append-only log keeps counts and category.
      reason: `${ids.length} candidate(s) | ${input.category ?? "selected"}`,
    });
    return created;
  });
  return { ok: true, id: batch.id, count: ids.length, skippedHumanReview, skippedClosed };
}

export async function cancelCloseOut(input: { batchId: number; companyId: number; actorUserId: number }): Promise<Result<object>> {
  const changed = await prisma.closeOutBatch.updateMany({
    where: { id: input.batchId, companyId: input.companyId, approvedAt: null, cancelledAt: null },
    data: { cancelledAt: new Date() },
  });
  if (changed.count !== 1) return { ok: false, error: "This close-out was already approved or cancelled." };
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: input.companyId,
    action: "CLOSE_OUT_CANCELLED",
    targetType: "CLOSE_OUT_BATCH",
    targetId: input.batchId,
  });
  return { ok: true };
}

/**
 * Approval must repeat the exact number of candidates in the frozen list.
 * Each candidate is then closed through the normal review decision, which
 * re-checks the current stage, records a decision and audit row, and refuses
 * candidates who asked for human review in the meantime.
 */
export async function approveCloseOut(input: {
  batchId: number;
  companyId: number;
  actorUserId: number;
  confirmCount: number;
  now?: Date;
}): Promise<Result<{ closed: number[]; skipped: Array<{ id: number; reason: string }>; notificationsAttempted: number }>> {
  const now = input.now ?? new Date();
  const batch = await prisma.closeOutBatch.findFirst({
    where: { id: input.batchId, companyId: input.companyId },
    select: { id: true, jobId: true, reason: true, applicationIds: true, proposedAt: true, approvedAt: true, cancelledAt: true },
  });
  if (!batch) return { ok: false, error: "Close-out not found." };
  if (batch.approvedAt || batch.cancelledAt) return { ok: false, error: "This close-out was already approved or cancelled." };
  if (now.getTime() - batch.proposedAt.getTime() > CLOSE_OUT_TTL_MS) {
    return { ok: false, error: "This proposal is more than 7 days old. Propose it again so the list is current." };
  }
  const ids = idsOf(batch.applicationIds);
  if (input.confirmCount !== ids.length) {
    return { ok: false, error: `Type ${ids.length} to confirm closing out ${ids.length} candidate(s).` };
  }

  const claimed = await prisma.closeOutBatch.updateMany({
    where: { id: batch.id, companyId: input.companyId, approvedAt: null, cancelledAt: null },
    data: { approvedAt: now, approvedByUserId: input.actorUserId },
  });
  if (claimed.count !== 1) return { ok: false, error: "This close-out was already approved or cancelled." };
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: input.companyId,
    action: "CLOSE_OUT_APPROVED",
    targetType: "CLOSE_OUT_BATCH",
    targetId: batch.id,
    reason: `${ids.length} candidate(s)`,
  });

  const current = await prisma.application.findMany({
    where: { id: { in: ids }, companyId: input.companyId, jobId: batch.jobId },
    select: { id: true, humanReviewRequestedAt: true, withdrawnAt: true },
  });
  const byId = new Map(current.map((row) => [row.id, row]));
  const closed: number[] = [];
  const skipped: Array<{ id: number; reason: string }> = [];
  let notificationsAttempted = 0;
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      skipped.push({ id, reason: "not found" });
      continue;
    }
    if (row.humanReviewRequestedAt) {
      skipped.push({ id, reason: "asked for human review" });
      continue;
    }
    if (row.withdrawnAt) {
      skipped.push({ id, reason: "withdrawn" });
      continue;
    }
    try {
      await applyReviewDecision({
        applicationId: id,
        actorUserId: input.actorUserId,
        action: "reject",
        reason: batch.reason,
        note: `Close-out #${batch.id}`,
      });
      closed.push(id);
    } catch (error) {
      skipped.push({ id, reason: error instanceof Error ? error.message : "failed" });
      continue;
    }
    await notifyCandidateOfStageChange(id, ApplicationPipelineStatus.REJECTED);
    notificationsAttempted += 1;
  }

  await prisma.closeOutBatch.update({
    where: { id: batch.id },
    data: { result: { closed: closed.length, closedIds: closed, skipped } },
  });
  return { ok: true, closed, skipped, notificationsAttempted };
}

export async function listCloseOuts(jobId: number, companyId: number) {
  const rows = await prisma.closeOutBatch.findMany({
    where: { jobId, companyId },
    orderBy: { proposedAt: "desc" },
    take: 20,
    select: {
      id: true,
      category: true,
      reason: true,
      applicationIds: true,
      proposedAt: true,
      approvedAt: true,
      cancelledAt: true,
      result: true,
    },
  });
  return rows.map((row) => ({ ...row, count: idsOf(row.applicationIds).length, applicationIds: undefined }));
}

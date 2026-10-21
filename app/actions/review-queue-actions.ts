"use server";

import { revalidatePath } from "next/cache";

import { deniesCrossCompany, requireAdmin, type AuthUser } from "@/lib/auth/authorization";
import { notifyCandidateOfStageChange } from "@/lib/candidates/stage-change-emails";
import { scheduleBackgroundWork } from "@/lib/communication/schedule-background";
import { analyseParsedCandidate } from "@/lib/resumes/analyse-after-parse";
import { applyReviewDecision } from "@/lib/review/review-queue-service";
import { prisma } from "@/lib/prisma";
import {
  approveCloseOut,
  cancelCloseOut,
  proposeCloseOut,
  type CloseOutCategory,
} from "@/lib/screening/close-out-service";
import { screeningSnapshot } from "@/lib/screening/screening-data";
import type { ApplicationPipelineStatus } from "@prisma/client";

async function assertReviewJob(admin: AuthUser, jobId: number, applicationId?: number) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { companyId: true } });
  if (!job || deniesCrossCompany(admin, job.companyId)) throw new Error("Application not found.");
  if (applicationId == null) return;
  const application = await prisma.application.findFirst({
    where: { id: applicationId, jobId, companyId: job.companyId },
    select: { id: true },
  });
  if (!application) throw new Error("Application not found.");
}

async function screeningSnapshotFor(jobId: number, applicationId: number) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { companyId: true } });
  if (!job) return null;
  try {
    return await screeningSnapshot(jobId, job.companyId, applicationId);
  } catch (error) {
    console.error("[review] screening snapshot failed", error instanceof Error ? error.message : "unknown");
    return null;
  }
}

export async function decideReviewApplication(input: {
  jobId: number;
  applicationId: number;
  action: "advance" | "shortlist" | "reject" | "undo";
  reason?: string | null;
  note?: string | null;
  undoTo?: ApplicationPipelineStatus | null;
  /** Explicit confirmation that the reviewer saw the candidate's human-review request. */
  humanReviewAcknowledged?: boolean;
}) {
  const admin = await requireAdmin();
  await assertReviewJob(admin, input.jobId, input.applicationId);
  if (!["advance", "shortlist", "reject", "undo"].includes(input.action)) throw new Error("Unknown action.");
  const result = await applyReviewDecision({
    applicationId: input.applicationId,
    actorUserId: admin.id,
    action: input.action,
    reason: input.reason,
    note: typeof input.note === "string" ? input.note : null,
    undoTo: input.undoTo,
    humanReviewAcknowledged: input.action !== "undo" && input.humanReviewAcknowledged === true,
    snapshot: await screeningSnapshotFor(input.jobId, input.applicationId),
  });
  if (input.action !== "undo") {
    scheduleBackgroundWork(() => notifyCandidateOfStageChange(input.applicationId, result.status));
  }
  revalidatePath(`/dashboard/jobs/${input.jobId}/review`);
  return result;
}

export async function runReviewAnalysis(input: { jobId: number; applicationId: number }) {
  const admin = await requireAdmin();
  void admin;
  await assertReviewJob(admin, input.jobId, input.applicationId);
  const application = await prisma.application.findUnique({
    where: { id: input.applicationId },
    select: { candidateId: true, companyId: true },
  });
  if (!application) throw new Error("Application not found.");
  const result = await analyseParsedCandidate({
    candidateId: application.candidateId,
    companyId: application.companyId,
    applicationId: input.applicationId,
  });
  revalidatePath(`/dashboard/jobs/${input.jobId}/review`);
  return result;
}

/**
 * Bulk advance or shortlist. Bulk rejection goes through a close-out
 * proposal and a separate approval instead. Each candidate succeeds or
 * fails on its own, so one stale row does not stop the rest.
 */
export async function bulkReviewApplications(input: {
  jobId: number;
  applicationIds: number[];
  /** Ignored. Kept so older clients still type-check. */
  rows?: unknown;
  action: "advance" | "shortlist" | "reject";
  reason?: string | null;
}) {
  const admin = await requireAdmin();
  await assertReviewJob(admin, input.jobId);
  if (!["advance", "shortlist", "reject"].includes(input.action)) throw new Error("Unknown action.");
  if (input.action === "reject") {
    throw new Error("Bulk rejection needs a close-out proposal and a separate approval.");
  }
  const requested = [...new Set(input.applicationIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 200);
  const blocked: number[] = [];
  const updated: number[] = [];
  const failed: Array<{ id: number; error: string }> = [];
  for (const applicationId of requested) {
    try {
      await assertReviewJob(admin, input.jobId, applicationId);
      const result = await applyReviewDecision({
        applicationId,
        actorUserId: admin.id,
        action: input.action,
        reason: input.reason,
      });
      scheduleBackgroundWork(() => notifyCandidateOfStageChange(applicationId, result.status));
      updated.push(applicationId);
    } catch (error) {
      if (error instanceof Error && /not found/i.test(error.message)) throw error;
      failed.push({ id: applicationId, error: error instanceof Error ? error.message : "Failed." });
    }
  }
  revalidatePath(`/dashboard/jobs/${input.jobId}/review`);
  return { updated, blocked, failed };
}

type CloseOutResult<T> = ({ ok: true } & T) | { ok: false; error: string };

async function closeOutJob(jobId: number) {
  const admin = await requireAdmin();
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { companyId: true } });
  if (!job || deniesCrossCompany(admin, job.companyId)) return null;
  return { admin, companyId: job.companyId };
}

export async function proposeReviewCloseOut(input: {
  jobId: number;
  reason: string;
  applicationIds?: number[];
  category?: CloseOutCategory;
}): Promise<CloseOutResult<{ id: number; count: number; skippedHumanReview: number; skippedClosed: number }>> {
  const owned = await closeOutJob(input.jobId);
  if (!owned) return { ok: false, error: "Job not found." };
  const result = await proposeCloseOut({
    jobId: input.jobId,
    companyId: owned.companyId,
    actorUserId: owned.admin.id,
    reason: input.reason,
    applicationIds: input.applicationIds,
    category: input.category,
  });
  revalidatePath(`/dashboard/jobs/${input.jobId}/review`);
  return result;
}

export async function approveReviewCloseOut(input: {
  jobId: number;
  batchId: number;
  confirmCount: number;
}): Promise<CloseOutResult<{ closed: number[]; skipped: Array<{ id: number; reason: string }>; notificationsAttempted: number }>> {
  const owned = await closeOutJob(input.jobId);
  if (!owned) return { ok: false, error: "Job not found." };
  const result = await approveCloseOut({
    batchId: input.batchId,
    companyId: owned.companyId,
    actorUserId: owned.admin.id,
    confirmCount: Number(input.confirmCount),
  });
  revalidatePath(`/dashboard/jobs/${input.jobId}/review`);
  return result;
}

export async function cancelReviewCloseOut(input: { jobId: number; batchId: number }): Promise<CloseOutResult<object>> {
  const owned = await closeOutJob(input.jobId);
  if (!owned) return { ok: false, error: "Job not found." };
  const result = await cancelCloseOut({ batchId: input.batchId, companyId: owned.companyId, actorUserId: owned.admin.id });
  revalidatePath(`/dashboard/jobs/${input.jobId}/review`);
  return result;
}

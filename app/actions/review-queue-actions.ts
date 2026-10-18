"use server";

import { revalidatePath } from "next/cache";

import { deniesCrossCompany, requireAdmin, type AuthUser } from "@/lib/auth/authorization";
import { bulkRejectPlan, type ReviewRow } from "@/lib/review/review-queue";
import { analyseParsedCandidate } from "@/lib/resumes/analyse-after-parse";
import { applyReviewDecision } from "@/lib/review/review-queue-service";
import { prisma } from "@/lib/prisma";
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

export async function decideReviewApplication(input: {
  jobId: number;
  applicationId: number;
  action: "advance" | "shortlist" | "reject" | "undo";
  reason?: string | null;
  undoTo?: ApplicationPipelineStatus | null;
}) {
  const admin = await requireAdmin();
  await assertReviewJob(admin, input.jobId, input.applicationId);
  const result = await applyReviewDecision({
    applicationId: input.applicationId,
    actorUserId: admin.id,
    action: input.action,
    reason: input.reason,
    undoTo: input.undoTo,
  });
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

export async function bulkReviewApplications(input: {
  jobId: number;
  applicationIds: number[];
  rows: ReviewRow[];
  action: "advance" | "shortlist" | "reject";
  reason?: string | null;
}) {
  const admin = await requireAdmin();
  await assertReviewJob(admin, input.jobId);
  const ids =
    input.action === "reject"
      ? bulkRejectPlan(input.rows, input.applicationIds).allowed
      : input.applicationIds;
  const blocked =
    input.action === "reject" ? bulkRejectPlan(input.rows, input.applicationIds).blocked : [];
  for (const applicationId of ids) {
    await assertReviewJob(admin, input.jobId, applicationId);
    await applyReviewDecision({
      applicationId,
      actorUserId: admin.id,
      action: input.action,
      reason: input.reason,
    });
  }
  revalidatePath(`/dashboard/jobs/${input.jobId}/review`);
  return { updated: ids, blocked };
}

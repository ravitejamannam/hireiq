"use server";

import { revalidatePath } from "next/cache";

import {
  createDraftAssessment,
  overrideAssessmentGrade,
  publishAssessment,
  regenerateAssessmentItem,
  regradeGeneratedAssessment,
  updateDraftAssessmentSettings,
} from "@/lib/assessments/generated-assessment-service";
import { deniesCrossCompany, requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

async function adminForJob(jobId: number) {
  const admin = await requireAdmin();
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { companyId: true } });
  if (!job || deniesCrossCompany(admin, job.companyId)) throw new Error("Requirement not found.");
  return { admin, companyId: job.companyId };
}

async function adminForAssessment(assessmentId: number) {
  const admin = await requireAdmin();
  const assessment = await prisma.generatedAssessment.findUnique({ where: { id: assessmentId }, select: { companyId: true, jobId: true } });
  if (!assessment || deniesCrossCompany(admin, assessment.companyId)) throw new Error("Assessment not found.");
  return { admin, companyId: assessment.companyId, jobId: assessment.jobId };
}

export async function createJobAssessmentDraft(jobId: number) {
  const { companyId } = await adminForJob(jobId);
  const draft = await createDraftAssessment(jobId, companyId);
  revalidatePath(`/dashboard/jobs/${jobId}/assessment`);
  return draft.id;
}

export async function regenerateJobAssessmentItem(assessmentId: number, itemId: string) {
  const { companyId, jobId } = await adminForAssessment(assessmentId);
  await regenerateAssessmentItem(assessmentId, itemId, companyId);
  revalidatePath(`/dashboard/jobs/${jobId}/assessment`);
}

export async function saveJobAssessmentSettings(input: {
  assessmentId: number;
  timeLimitMinutes: number;
  drawCount: number;
  candidateInstructions: string | null;
}): Promise<ActionResult> {
  try {
    const { companyId, jobId } = await adminForAssessment(input.assessmentId);
    await updateDraftAssessmentSettings({
      assessmentId: input.assessmentId,
      timeLimitMinutes: Number(input.timeLimitMinutes),
      drawCount: Number(input.drawCount),
      candidateInstructions: typeof input.candidateInstructions === "string" ? input.candidateInstructions : null,
      companyId,
    });
    revalidatePath(`/dashboard/jobs/${jobId}/assessment`);
    return { ok: true };
  } catch (error) {
    return actionFailure(error, "save settings");
  }
}

export async function publishJobAssessment(assessmentId: number) {
  const { admin, companyId } = await adminForAssessment(assessmentId);
  const published = await publishAssessment(assessmentId, admin.id, companyId);
  revalidatePath(`/dashboard/jobs/${published.jobId}/assessment`);
}

async function adminForInvite(inviteId: number) {
  const admin = await requireAdmin();
  const invite = await prisma.generatedAssessmentInvite.findUnique({
    where: { id: inviteId },
    select: { applicationId: true, assessment: { select: { companyId: true, jobId: true } } },
  });
  if (!invite || deniesCrossCompany(admin, invite.assessment.companyId)) throw new Error("Assessment not found.");
  return { admin, companyId: invite.assessment.companyId, jobId: invite.assessment.jobId, applicationId: invite.applicationId };
}

type ActionResult = { ok: true } | { ok: false; error: string };

function actionFailure(error: unknown, context: string): ActionResult {
  if (error instanceof Error && error.message && !/prisma|database|ECONN|timeout/i.test(error.message)) {
    return { ok: false, error: error.message };
  }
  console.error(`[assessment] ${context} failed`, error instanceof Error ? error.message : "unknown");
  return { ok: false, error: "Something went wrong. Nothing was changed; try again." };
}

export async function correctAssessmentItemGrade(input: { inviteId: number; itemId: string; score: number; reason: string }): Promise<ActionResult> {
  try {
    const { admin, companyId, jobId, applicationId } = await adminForInvite(input.inviteId);
    await overrideAssessmentGrade({
      inviteId: input.inviteId,
      itemId: String(input.itemId),
      score: Number(input.score),
      reason: String(input.reason ?? ""),
      actorUserId: admin.id,
      companyId,
    });
    revalidatePath(`/dashboard/jobs/${jobId}/evaluation/${applicationId}`);
    revalidatePath(`/dashboard/jobs/${jobId}/review`);
    return { ok: true };
  } catch (error) {
    return actionFailure(error, "correct grade");
  }
}

export async function rerunAssessmentGrading(inviteId: number): Promise<ActionResult> {
  try {
    const { admin, companyId, jobId, applicationId } = await adminForInvite(inviteId);
    await regradeGeneratedAssessment({ inviteId, companyId, actorUserId: admin.id });
    revalidatePath(`/dashboard/jobs/${jobId}/evaluation/${applicationId}`);
    revalidatePath(`/dashboard/jobs/${jobId}/review`);
    return { ok: true };
  } catch (error) {
    return actionFailure(error, "regrade");
  }
}

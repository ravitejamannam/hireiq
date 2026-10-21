"use server";

import { revalidatePath } from "next/cache";

import { sendAssessmentLink } from "@/lib/assessments/generated-assessment-service";
import { deniesCrossCompany, requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { emailOutcomeLabel } from "@/lib/screening/candidate-email";
import { assignPractical, recordPracticalScores, suggestPracticalScores } from "@/lib/screening/practical-service";
import { saveMustHaves } from "@/lib/screening/must-haves";
import { saveScreeningPolicy } from "@/lib/screening/screening-policy-service";
import { reviewSpotCheck } from "@/lib/screening/spot-checks";
import { inviteToWalkthrough as inviteApplicationToWalkthrough } from "@/lib/screening/walkthrough-service";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function failure(error: unknown, context: string): { ok: false; error: string } {
  if (error instanceof Error && error.message && !/prisma|database|ECONN|timeout/i.test(error.message)) {
    return { ok: false, error: error.message };
  }
  console.error(`[screening] ${context} failed`, error instanceof Error ? error.message : "unknown");
  return { ok: false, error: "Something went wrong. Nothing was changed; try again." };
}

async function adminForApplication(jobId: number, applicationId: number) {
  const admin = await requireAdmin();
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { companyId: true } });
  if (!job || deniesCrossCompany(admin, job.companyId)) throw new Error("Application not found.");
  const application = await prisma.application.findFirst({ where: { id: applicationId, jobId, companyId: job.companyId }, select: { id: true } });
  if (!application) throw new Error("Application not found.");
  return { admin, companyId: job.companyId };
}

async function adminForPractical(codingTestId: number) {
  const admin = await requireAdmin();
  const row = await prisma.codingTest.findUnique({
    where: { id: codingTestId },
    select: { applicationId: true, application: { select: { companyId: true, jobId: true } } },
  });
  if (!row || deniesCrossCompany(admin, row.application.companyId)) throw new Error("Practical not found.");
  return { admin, companyId: row.application.companyId, jobId: row.application.jobId, applicationId: row.applicationId };
}

function revalidateJob(jobId: number, applicationId?: number) {
  revalidatePath(`/dashboard/jobs/${jobId}/review`);
  if (applicationId) revalidatePath(`/dashboard/jobs/${jobId}/evaluation/${applicationId}`);
}

export async function sendBasicAssessment(input: { jobId: number; applicationId: number; retake?: boolean }): Promise<Result<{ url: string; message: string }>> {
  try {
    const { admin, companyId } = await adminForApplication(input.jobId, input.applicationId);
    const sent = await sendAssessmentLink({ applicationId: input.applicationId, actorUserId: admin.id, companyId, retake: input.retake === true });
    revalidateJob(input.jobId, input.applicationId);
    return { ok: true, url: sent.url, message: `${sent.reused ? "A fresh link replaced the open one. " : ""}${emailOutcomeLabel(sent.emailOutcome)}` };
  } catch (error) {
    return failure(error, "send assessment");
  }
}

export async function assignPracticalTask(input: { jobId: number; applicationId: number; reassign?: boolean }): Promise<Result<{ url: string; message: string }>> {
  try {
    const { admin, companyId } = await adminForApplication(input.jobId, input.applicationId);
    const assigned = await assignPractical({ applicationId: input.applicationId, companyId, actorUserId: admin.id, reassign: input.reassign === true });
    revalidateJob(input.jobId, input.applicationId);
    return { ok: true, url: assigned.url, message: `${assigned.reused ? "A fresh link replaced the open one. " : ""}${emailOutcomeLabel(assigned.emailOutcome)}` };
  } catch (error) {
    return failure(error, "assign practical");
  }
}

export async function savePracticalScores(input: {
  codingTestId: number;
  scores: Array<{ criterionKey: string; points: number; rationale?: string | null }>;
}): Promise<Result<{ complete: boolean; changed: number }>> {
  try {
    if (!Array.isArray(input.scores) || input.scores.length > 20) throw new Error("Scores are not valid.");
    const { admin, companyId, jobId, applicationId } = await adminForPractical(input.codingTestId);
    const scores = input.scores.map((score) => ({
      criterionKey: String(score.criterionKey),
      points: Number(score.points),
      rationale: typeof score.rationale === "string" ? score.rationale : null,
    }));
    const result = await recordPracticalScores({ codingTestId: input.codingTestId, companyId, actorUserId: admin.id, scores });
    revalidateJob(jobId, applicationId);
    return { ok: true, ...result };
  } catch (error) {
    return failure(error, "grade practical");
  }
}

export async function requestPracticalSuggestions(codingTestId: number): Promise<Result<{ suggested: number; dropped: number }>> {
  try {
    const { admin, companyId, jobId, applicationId } = await adminForPractical(codingTestId);
    const result = await suggestPracticalScores({ codingTestId, companyId, actorUserId: admin.id });
    revalidateJob(jobId, applicationId);
    return { ok: true, ...result };
  } catch (error) {
    return failure(error, "suggest practical");
  }
}

export async function saveJobScreeningPolicy(input: { jobId: number; values: unknown }): Promise<Result<{ version: number }>> {
  try {
    const admin = await requireAdmin();
    const job = await prisma.job.findUnique({ where: { id: input.jobId }, select: { companyId: true } });
    if (!job || deniesCrossCompany(admin, job.companyId)) throw new Error("Job not found.");
    const saved = await saveScreeningPolicy({ jobId: input.jobId, companyId: job.companyId, actorUserId: admin.id, values: input.values });
    if (!saved.ok) return saved;
    revalidatePath(`/dashboard/jobs/${input.jobId}/screening`);
    revalidatePath(`/dashboard/jobs/${input.jobId}/review`);
    return { ok: true, version: saved.version };
  } catch (error) {
    return failure(error, "save policy");
  }
}

export async function saveJobMustHaves(input: { jobId: number; items: unknown }): Promise<Result<{ count: number }>> {
  try {
    const admin = await requireAdmin();
    const job = await prisma.job.findUnique({ where: { id: input.jobId }, select: { companyId: true } });
    if (!job || deniesCrossCompany(admin, job.companyId)) throw new Error("Job not found.");
    const saved = await saveMustHaves({ jobId: input.jobId, companyId: job.companyId, actorUserId: admin.id, items: input.items });
    if (!saved.ok) return saved;
    revalidatePath(`/dashboard/jobs/${input.jobId}/screening`);
    return { ok: true, count: saved.count };
  } catch (error) {
    return failure(error, "save must-haves");
  }
}

export async function recordSpotCheckReview(input: {
  jobId: number;
  spotCheckId: number;
  outcome: string;
  note: string;
}): Promise<Result<object>> {
  try {
    const admin = await requireAdmin();
    const job = await prisma.job.findUnique({ where: { id: input.jobId }, select: { companyId: true } });
    if (!job || deniesCrossCompany(admin, job.companyId)) throw new Error("Job not found.");
    const saved = await reviewSpotCheck({
      spotCheckId: input.spotCheckId,
      jobId: input.jobId,
      companyId: job.companyId,
      actorUserId: admin.id,
      outcome: input.outcome,
      note: input.note,
    });
    if (!saved.ok) return saved;
    revalidatePath(`/dashboard/jobs/${input.jobId}/screening`);
    return { ok: true };
  } catch (error) {
    return failure(error, "record spot check");
  }
}

/** Sends the candidate a booking link for a short walkthrough of their work. */
export async function inviteToWalkthrough(input: {
  jobId: number;
  applicationId: number;
  resend?: boolean;
}): Promise<Result<{ message: string; url: string }> | { ok: false; error: string; canResend: true }> {
  try {
    const { admin, companyId } = await adminForApplication(input.jobId, input.applicationId);
    const result = await inviteApplicationToWalkthrough({
      jobId: input.jobId,
      applicationId: input.applicationId,
      companyId,
      actorUserId: admin.id,
      resend: input.resend === true,
    });
    if (!result.ok) {
      return result.code === "ALREADY_INVITED" ? { ok: false, error: result.error, canResend: true } : { ok: false, error: result.error };
    }
    revalidatePath(`/dashboard/jobs/${input.jobId}/review`);
    const verb = result.resent ? "A fresh walkthrough link replaced the old one." : "Walkthrough booking link created.";
    return { ok: true, message: `${verb} ${emailOutcomeLabel(result.emailOutcome)}`, url: result.url };
  } catch (error) {
    return failure(error, "invite to walkthrough");
  }
}

import type { AiPreference } from "@prisma/client";

import { aiBlockedApplicationIds, aiBlockedCandidateIds, aiBlockReasonForSubject } from "@/lib/ai/ai-policy";
import { prisma } from "@/lib/prisma";

export type EvaluationConsent = {
  aiEvaluationOptOut: boolean;
  humanReviewRequestedAt: Date | null;
};

export class AiEvaluationOptOutError extends Error {
  readonly code = "AI_EVALUATION_OPT_OUT";

  readonly reason: string;

  constructor(reason = "REFUSED") {
    super("Candidate opted out of AI evaluation.");
    this.reason = reason;
    this.name = "AiEvaluationOptOutError";
  }
}

export function evaluationAllowed(consent: EvaluationConsent & { aiPreference?: AiPreference }) {
  if (consent.humanReviewRequestedAt) return false;
  if (consent.aiPreference !== undefined) return consent.aiPreference === "ALLOWED";
  return !consent.aiEvaluationOptOut;
}

/** Despite the names, these return who AI may NOT process: refused, unknown, or human review requested. */
export async function optedOutApplicationIds(companyId: number, applicationIds: number[]) {
  return aiBlockedApplicationIds(companyId, applicationIds);
}

export async function optedOutCandidateIds(companyId: number, candidateIds: number[]) {
  return aiBlockedCandidateIds(companyId, candidateIds);
}

/** Throws unless the application (or every application of the candidate) is explicitly ALLOWED with no human review requested. */
export async function assertAIEvaluationAllowed(subject: {
  applicationId?: number;
  candidateId?: number;
  companyId?: number;
}) {
  const reason = await aiBlockReasonForSubject(subject);
  if (reason) throw new AiEvaluationOptOutError(reason);
}

/** Stops in-flight evaluation. Completed scores stay in the database and are hidden in the review queue. */
export async function stopQueuedAiEvaluation(applicationId: number) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, candidateId: true, companyId: true },
  });
  if (!application) return;
  const now = new Date();
  await prisma.candidateIntelligenceRun.updateMany({
    where: {
      candidateId: application.candidateId,
      companyId: application.companyId,
      status: "RUNNING",
    },
    data: { status: "FAILED", errorCode: "AI_EVALUATION_OPT_OUT", completedAt: now },
  });
  await prisma.candidateMatchRun.updateMany({
    where: { applicationId: application.id, companyId: application.companyId, status: "RUNNING" },
    data: { status: "FAILED", errorCode: "AI_EVALUATION_OPT_OUT", completedAt: now },
  });
}

export function humanReviewTask(consent: EvaluationConsent & { applicationId: number }) {
  if (!consent.humanReviewRequestedAt) return null;
  return {
    applicationId: consent.applicationId,
    kind: "HUMAN_REVIEW" as const,
    requestedAt: consent.humanReviewRequestedAt,
  };
}

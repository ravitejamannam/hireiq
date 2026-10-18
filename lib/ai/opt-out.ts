import { prisma } from "@/lib/prisma";

export type EvaluationConsent = {
  aiEvaluationOptOut: boolean;
  humanReviewRequestedAt: Date | null;
};

export class AiEvaluationOptOutError extends Error {
  readonly code = "AI_EVALUATION_OPT_OUT";

  constructor() {
    super("Candidate opted out of AI evaluation.");
    this.name = "AiEvaluationOptOutError";
  }
}

export function evaluationAllowed(consent: EvaluationConsent) {
  return !consent.aiEvaluationOptOut;
}

export async function optedOutApplicationIds(companyId: number, applicationIds: number[]) {
  if (applicationIds.length === 0) return new Set<number>();
  const rows = await prisma.application.findMany({
    where: { companyId, id: { in: applicationIds }, aiEvaluationOptOut: true },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

export async function optedOutCandidateIds(companyId: number, candidateIds: number[]) {
  if (candidateIds.length === 0) return new Set<number>();
  const rows = await prisma.application.findMany({
    where: { companyId, candidateId: { in: candidateIds }, aiEvaluationOptOut: true },
    select: { candidateId: true },
  });
  return new Set(rows.map((row) => row.candidateId));
}

/** Throws when this application, or any application for this candidate, opted out. */
export async function assertAIEvaluationAllowed(subject: {
  applicationId?: number;
  candidateId?: number;
  companyId?: number;
}) {
  if (subject.applicationId) {
    const row = await prisma.application.findUnique({
      where: { id: subject.applicationId },
      select: { aiEvaluationOptOut: true },
    });
    if (row?.aiEvaluationOptOut) throw new AiEvaluationOptOutError();
    return;
  }
  if (subject.candidateId) {
    const row = await prisma.application.findFirst({
      where: {
        candidateId: subject.candidateId,
        companyId: subject.companyId,
        aiEvaluationOptOut: true,
      },
      select: { id: true },
    });
    if (row) throw new AiEvaluationOptOutError();
  }
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

import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";

/**
 * Candidate-facing status resolution (T116).
 *
 * Resolves a status tracking token to a clean, candidate-safe view of
 * their application's pipeline position. Exposes ZERO internal data:
 * no recruiter notes, no evidence text, no AI claims, no other
 * candidates' information.
 */

export type PublicStatusView = {
  jobTitle: string;
  companyName: string;
  currentStage: string;
  appliedAt: Date;
  assessmentScore: number | null;
  assessmentMax: number | null;
  notice: string | null;
  optedOut: boolean;
  humanReviewRequested: boolean;
  interviews: Array<{ at: Date; type: string }>;
};

const STAGE_LABELS: Record<string, string> = {
  CV_POOL: "Application received",
  EXPERT_REVIEW: "Under review",
  TECH_EVALUATION: "Technical evaluation",
  SHORTLISTED: "Shortlisted",
  SELECTED: "Selected by client",
  HIRED: "Hired 🎉",
  REJECTED: "Not progressing",
};

export async function getPublicStatus(
  rawToken: string,
): Promise<PublicStatusView | null> {
  if (!rawToken || typeof rawToken !== "string") return null;

  const tokenHash = createHash("sha256")
    .update(rawToken, "utf8")
    .digest("hex");

  const application = await prisma.application.findFirst({
    where: { statusTokenHash: tokenHash },
    select: {
      id: true,
      status: true,
      createdAt: true,
      aiEvaluationOptOut: true,
      humanReviewRequestedAt: true,
      job: {
        select: {
          title: true,
          company: { select: { name: true, applyNoticeText: true } },
        },
      },
      interviews: {
        orderBy: { interviewAt: "asc" },
        take: 5,
        select: { interviewAt: true, type: true },
      },
      candidate: {
        select: { name: true },
      },
      assessmentInvite: {
        select: {
          attempt: {
            select: { score: true, maxScore: true, status: true },
          },
        },
      },
    },
  });
  if (!application) return null;

  const assessment = application.assessmentInvite?.attempt ?? null;

  return {
    jobTitle: application.job.title,
    companyName: application.job.company.name,
    currentStage: STAGE_LABELS[application.status] ?? application.status,
    appliedAt: application.createdAt,
    assessmentScore: assessment?.score ?? null,
    assessmentMax: assessment?.maxScore ?? null,
    notice: application.job.company.applyNoticeText,
    optedOut: application.aiEvaluationOptOut,
    humanReviewRequested: application.humanReviewRequestedAt !== null,
    interviews: application.interviews.map((row) => ({
      at: row.interviewAt,
      type: row.type,
    })),
  };
}


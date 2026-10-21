import { AiPreference } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The one place that decides whether AI may process a candidate's data.
 * AI is allowed only when the preference is explicitly ALLOWED and no human review was requested.
 * UNKNOWN (nothing on record) is treated like a refusal. Callers re-read this at run time, so a change
 * of preference takes effect for queued and retried work.
 */
export type AiBlockReason =
  | "UNKNOWN_PREFERENCE"
  | "REFUSED"
  | "HUMAN_REVIEW_REQUESTED"
  | "ERASED"
  | "NO_APPLICATION"
  | "NOT_FOUND";

export type AiSubject = { applicationId?: number | null; candidateId?: number | null; companyId?: number | null };

export type ApplicationAiState = { aiPreference: AiPreference; humanReviewRequestedAt: Date | null; aiEvaluationOptOut?: boolean; candidate?: { erasedAt: Date | null } };

export function applicationAiBlockReason(row: ApplicationAiState): AiBlockReason | null {
  if (row.candidate?.erasedAt) return "ERASED";
  if (row.humanReviewRequestedAt) return "HUMAN_REVIEW_REQUESTED";
  // The legacy flag is honoured too: a writer that only sets it can refuse, never allow.
  if (row.aiPreference === AiPreference.REFUSED || row.aiEvaluationOptOut) return "REFUSED";
  if (row.aiPreference !== AiPreference.ALLOWED) return "UNKNOWN_PREFERENCE";
  return null;
}

type Db = Pick<typeof prisma, "application">;
const SELECT = { id: true, candidateId: true, companyId: true, aiPreference: true, aiEvaluationOptOut: true, humanReviewRequestedAt: true, candidate: { select: { erasedAt: true } } } as const;

/** Null means AI may process this subject. A subject with no application has no recorded preference, so it is blocked. */
export async function aiBlockReasonForSubject(subject: AiSubject, db: Db = prisma): Promise<AiBlockReason | null> {
  if (subject.applicationId) {
    const row = await db.application.findUnique({ where: { id: subject.applicationId }, select: SELECT });
    if (!row || (subject.companyId != null && row.companyId !== subject.companyId)) return "NOT_FOUND";
    return applicationAiBlockReason(row);
  }
  if (subject.candidateId && subject.companyId) {
    const rows = await db.application.findMany({
      where: { candidateId: subject.candidateId, companyId: subject.companyId },
      select: SELECT,
    });
    if (rows.length === 0) return "NO_APPLICATION";
    for (const row of rows) {
      const reason = applicationAiBlockReason(row);
      if (reason) return reason;
    }
    return null;
  }
  return "NO_APPLICATION";
}

export async function aiBlockedApplicationIds(companyId: number, applicationIds: number[], db: Db = prisma) {
  if (applicationIds.length === 0) return new Set<number>();
  const rows = await db.application.findMany({ where: { companyId, id: { in: applicationIds } }, select: SELECT });
  const allowed = new Set(rows.filter((row) => !applicationAiBlockReason(row)).map((row) => row.id));
  return new Set(applicationIds.filter((id) => !allowed.has(id)));
}

/** Blocked when any application is not ALLOWED, or when the candidate has no application (no recorded preference). */
export async function aiBlockedCandidateIds(companyId: number, candidateIds: number[], db: Db = prisma) {
  if (candidateIds.length === 0) return new Set<number>();
  const rows = await db.application.findMany({ where: { companyId, candidateId: { in: candidateIds } }, select: SELECT });
  const blocked = new Set<number>();
  const seen = new Set<number>();
  for (const row of rows) {
    seen.add(row.candidateId);
    if (applicationAiBlockReason(row)) blocked.add(row.candidateId);
  }
  for (const id of candidateIds) if (!seen.has(id)) blocked.add(id);
  return blocked;
}

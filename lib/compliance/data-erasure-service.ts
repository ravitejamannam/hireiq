import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/authorization";
import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { eraseCandidate } from "@/lib/privacy/candidate-erasure";

/**
 * GDPR Article 17 — right to erasure (T114).
 *
 * Reconciles two duties:
 * - Erase personal data (name, contact, free text, resumes, signals).
 * - Preserve the audit trail's STRUCTURE (§6): scores, statuses,
 *   timestamps, and content hashes survive — they prove the process ran
 *   without identifying anyone.
 *
 * What is erased vs kept:
 *
 *  ERASED                              KEPT
 *  ────────────────────────────────    ──────────────────────────────
 *  name, employer, skills,             candidate.id, pipeline statuses
 *  expectedCTC, location               application statuses + dates
 *  submission email/phone/             evidence.contentSha256 (hash only)
 *    linkedIn/coverLetter              assessment scores + attempts
 *  profile headline/employer/          evaluation scores, rubric weights
 *    linkedIn/skillsText               interview results, coding scores
 *  resume binaries + extracted         blueprint rubric structure
 *    text, identity signal values      billing amounts (legal record)
 *  non-skill claim values
 *
 * The list above is the original T114 scope. The full, current treatment of every
 * data category is in lib/privacy/candidate-erasure.ts and
 * docs/privacy/data-lifecycle-inventory.md.
 * Admin-only. Callers should confirm no legal hold applies before invoking.
 */

export class DataErasureError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export async function anonymizeCandidateForAdmin(input: {
  actorUserId: number;
  candidateIdInput: unknown;
  /** Audit fix: when provided, cross-tenant candidates resolve to NOT_FOUND. */
  expectedCompanyId?: number;
}): Promise<{ candidateId: number; erasedItems: string[]; status: "COMPLETED" | "PARTIAL"; failedSteps: string[] }> {
  await requireAdmin();

  const candidateId = validateCandidateId(input.candidateIdInput);
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, companyId: true },
  });
  if (!candidate) throw new DataErasureError("CANDIDATE_NOT_FOUND");
  if (input.expectedCompanyId !== undefined && candidate.companyId !== input.expectedCompanyId) {
    throw new DataErasureError("CANDIDATE_NOT_FOUND");
  }

  const result = await eraseCandidate({
    companyId: candidate.companyId,
    candidateId,
    trigger: "ADMIN_REQUEST",
    requestedByUserId: input.actorUserId,
  });
  // The audit row says that an erasure ran and how it ended. It holds no name, email or content.
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: candidate.companyId,
    action: "CANDIDATE_ERASED",
    targetType: "CANDIDATE",
    targetId: candidateId,
    reason: `${result.status} steps=${result.completedSteps.length} failed=${result.failedSteps.length} attempt=${result.attempts}`,
  });
  return { candidateId, erasedItems: result.completedSteps, status: result.status, failedSteps: result.failedSteps };
}

function validateCandidateId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (parsed > 0) return parsed;
  }
  throw new DataErasureError("INVALID_CANDIDATE_ID");
}

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/authorization";

/**
 * Decision-support assembly (T99 Phase 8 / constitution §33).
 *
 * Presents every hiring signal as its own labeled card — assessment,
 * evidence-backed matching, human evaluations (incl. rubric snapshots),
 * interviews, coding tests, expert score — WITHOUT collapsing them into
 * one opaque number. The panel's job is visibility, not verdicts.
 */

export class DecisionSupportError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export type CandidateSignal = {
  kind:
    | "EXPERT_SCORE"
    | "ASSESSMENT"
    | "MATCHING"
    | "EVALUATION"
    | "INTERVIEW"
    | "CODING_TEST"
    | "REPORT";
  label: string;
  detail: string;
  meta: string | null;
};

export type DecisionSupportView = {
  candidateId: number;
  candidateName: string;
  signals: CandidateSignal[];
};

export async function getDecisionSupportForCandidate(
  candidateIdInput: unknown,
  options?: { companyId?: number; skipAdmin?: boolean },
): Promise<DecisionSupportView> {
  if (!options?.skipAdmin) {
    await requireAdmin();
  }

  const candidateId = validateCandidateId(candidateIdInput);
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, name: true, companyId: true },
  });
  if (!candidate) throw new DecisionSupportError("CANDIDATE_NOT_FOUND");
  if (
    options?.companyId !== undefined &&
    candidate.companyId !== options.companyId
  ) {
    throw new DecisionSupportError("CANDIDATE_NOT_FOUND");
  }

  const applications = await prisma.application.findMany({
    where: {
      candidateId,
      ...(options?.companyId ? { companyId: options.companyId } : {}),
    },
    select: {
      id: true,
      status: true,
      expertScore: true,
      job: { select: { title: true } },
      interviews: {
        select: { id: true, type: true, result: true, interviewAt: true },
        orderBy: { interviewAt: "desc" },
      },
      codingTests: {
        select: { id: true, title: true, score: true, maxScore: true, status: true },
      },
      evaluations: {
        select: {
          id: true,
          overallScore: true,
          recommendation: true,
          evaluatedAt: true,
          interviewer: { select: { name: true } },
          competencyScores: {
            select: { competencyName: true, weightSnapshot: true, score: true },
          },
        },
        orderBy: { updatedAt: "desc" },
      },
      reports: {
        select: { id: true, recommendation: true, notes: true },
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: { id: "desc" },
  });

  // Assessment scores per application (chain: Application → Invite → Attempt).
  const attempts = await prisma.assessmentAttempt.findMany({
    where: {
      status: "COMPLETED",
      invite: { applicationId: { in: applications.map((a) => a.id) } },
    },
    select: {
      score: true,
      maxScore: true,
      submittedAt: true,
      integritySignals: true,
      invite: { select: { applicationId: true, roleCategory: true } },
    },
  });
  const assessmentByApp = new Map(
    attempts.map((a) => [a.invite.applicationId, a]),
  );

  const matchRuns = await prisma.candidateMatchRun.findMany({
    where: {
      candidateId,
      status: "COMPLETED",
      applicationId: { in: applications.map((a) => a.id) },
    },
    select: {
      applicationId: true,
      requirementMatches: { select: { result: true } },
    },
    orderBy: { id: "desc" },
  });
  const matchByApp = new Map<number, (typeof matchRuns)[number]>();
  for (const run of matchRuns) {
    if (!matchByApp.has(run.applicationId)) {
      matchByApp.set(run.applicationId, run);
    }
  }

  const signals: CandidateSignal[] = [];

  for (const app of applications) {
    const scope = app.job.title;

    // Expert score (human recruiter input on the Application itself)
    if (app.expertScore !== null && app.expertScore !== undefined) {
      signals.push({
        kind: "EXPERT_SCORE",
        label: `Expert score — ${scope}`,
        detail: String(app.expertScore),
        meta: `application #${app.id} · ${app.status}`,
      });
    }

    // Assessment (machine-scored MCQ; independent signal per §12)
    const assessment = assessmentByApp.get(app.id);
    if (assessment?.submittedAt) {
      const integrity = normalizeIntegrity(assessment.integritySignals);
      const integrityMeta = integrity
        ? `self-reported focus signals — ${integrity.tabSwitches} tab switches, ${integrity.pastes} pastes, ${integrity.copies} copies (not proof of misconduct)`
        : `submitted ${assessment.submittedAt.toLocaleDateString() ?? ""} · independent of matching`;
      signals.push({
        kind: "ASSESSMENT",
        label: `Assessment${assessment.invite.roleCategory ? ` · ${assessment.invite.roleCategory}` : ""} — ${scope}`,
        detail: `${assessment.score}/${assessment.maxScore}`,
        meta: integrityMeta,
      });
    }

    const matchRun = matchByApp.get(app.id);
    if (matchRun) {
      const satisfied = matchRun.requirementMatches.filter(
        (row) => row.result === "SATISFIED",
      ).length;
      const unknown = matchRun.requirementMatches.filter(
        (row) => row.result === "UNKNOWN",
      ).length;
      signals.push({
        kind: "MATCHING",
        label: `Evidence coverage — ${scope}`,
        detail: `${satisfied} satisfied`,
        meta: `${unknown} unknown (missing evidence, not a fail) · ${matchRun.requirementMatches.length} requirements`,
      });
    }

    // Evaluations incl. weighted rubric snapshot totals
    for (const evaluation of app.evaluations) {
      let rubricDetail = evaluation.overallScore !== null ? `overall ${evaluation.overallScore}` : "";
      if (evaluation.competencyScores.length > 0) {
        const totalWeight = evaluation.competencyScores.reduce(
          (sum, s) => sum + s.weightSnapshot,
          0,
        );
        const weighted =
          totalWeight > 0
            ? evaluation.competencyScores.reduce(
                (sum, s) => sum + (s.score / 5) * s.weightSnapshot,
                0,
              ) / totalWeight
            : 0;
        rubricDetail = `rubric ${Math.round(weighted * 100)}%`;
      }
      signals.push({
        kind: "EVALUATION",
        label: `Evaluation by ${evaluation.interviewer.name} — ${scope}`,
        detail:
          [
            evaluation.recommendation ?? null,
            rubricDetail || null,
          ]
            .filter(Boolean)
            .join(" · ") || "submitted",
        meta:
          evaluation.evaluatedAt?.toLocaleDateString() ??
          `not finalized · ${evaluation.competencyScores.length} rubric scores`,
      });
    }

    // Interviews
    for (const interview of app.interviews) {
      signals.push({
        kind: "INTERVIEW",
        label: `${interview.type.replace("_", " ")} interview — ${scope}`,
        detail: interview.result,
        meta: new Date(interview.interviewAt).toLocaleString(),
      });
    }

    // Coding tests
    for (const test of app.codingTests) {
      signals.push({
        kind: "CODING_TEST",
        label: `Coding test — ${scope}`,
        detail:
          test.status === "COMPLETED"
            ? `${test.score}/${test.maxScore}`
            : test.status,
        meta: test.title,
      });
    }

    // Reports
    for (const report of app.reports) {
      signals.push({
        kind: "REPORT",
        label: `Report — ${scope}`,
        detail: report.recommendation,
        meta: report.notes?.slice(0, 140) ?? null,
      });
    }
  }

  return {
    candidateId: candidate.id,
    candidateName: candidate.name,
    signals,
  };
}

function validateCandidateId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (parsed > 0) return parsed;
  }
  throw new DecisionSupportError("INVALID_CANDIDATE_ID");
}

function normalizeIntegrity(value: unknown): {
  tabSwitches: number;
  pastes: number;
  copies: number;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const nums = [r.tabSwitches, r.pastes, r.copies].map((n) =>
    typeof n === "number" && n >= 0 ? n : 0,
  );
  if (nums.every((n) => n === 0)) return null;
  return { tabSwitches: nums[0], pastes: nums[1], copies: nums[2] };
}

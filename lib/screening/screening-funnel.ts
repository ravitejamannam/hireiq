import { ApplicationPipelineStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Screening funnel for one job. Cohort = applications created inside the
 * window; every later step counts what happened to that cohort, whenever it
 * happened. Each rate names its own denominator.
 */

export type ScreeningFunnelSnapshot = {
  createdAt: Date;
  status: ApplicationPipelineStatus;
  shortlistedAt: Date | null;
  basicInvitedAt: Date | null;
  basicStartedAt: Date | null;
  basicSubmittedAt: Date | null;
  basicGraded: boolean;
  practicalAssignedAt: Date | null;
  practicalSubmittedAt: Date | null;
  practicalGraded: boolean;
  /** A recruiter recorded a review decision for this application. */
  humanDecided: boolean;
};

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  denominatorLabel: string;
  denominator: number;
  /** Null when the denominator is zero. */
  rate: number | null;
  /** Denominator minus count: how many of the previous group did not reach this step. */
  dropOff: number;
};

/**
 * Assumptions behind the time-saved estimate. They are shown next to the
 * number, and the number is labelled an estimate, because none of them is measured.
 */
export const TIME_SAVED_ASSUMPTIONS = {
  manualScreenMinutesPerApplicant: 6,
  practicalGradeMinutes: 15,
  writtenGradeMinutesPerSubmission: 3,
} as const;

const ADVANCED: ApplicationPipelineStatus[] = [
  ApplicationPipelineStatus.EXPERT_REVIEW,
  ApplicationPipelineStatus.TECH_EVALUATION,
  ApplicationPipelineStatus.SHORTLISTED,
  ApplicationPipelineStatus.SELECTED,
  ApplicationPipelineStatus.HIRED,
];

function step(key: string, label: string, count: number, denominatorLabel: string, denominator: number): FunnelStep {
  return {
    key,
    label,
    count,
    denominatorLabel,
    denominator,
    rate: denominator > 0 ? Math.round((count / denominator) * 1000) / 10 : null,
    dropOff: Math.max(0, denominator - count),
  };
}

function medianHours(spans: number[]) {
  if (spans.length === 0) return null;
  const sorted = [...spans].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return Math.round((value / 3_600_000) * 10) / 10;
}

function medianMinutes(values: number[]) {
  const value = medianHours(values);
  return value === null ? null : Math.round(value * 60);
}

/**
 * Recruiter labour only. Baseline: a recruiter screens every applicant by hand.
 * Staged: a recruiter reviews each applicant with a recorded decision, grades each
 * practical, and grades basic assessments the system could not fully score.
 * Automated scoring, elapsed waiting time, one-off setup (rubric, question pool,
 * policy) and candidate time are not counted on either side.
 * Negative savedMinutes means staged screening cost recruiters more time.
 */
export function estimateRecruiterTimeSaved(input: {
  applied: number;
  humanDecided: number;
  practicalGraded: number;
  basicNeedsHumanGrading: number;
  assumptions?: typeof TIME_SAVED_ASSUMPTIONS;
}) {
  const a = input.assumptions ?? TIME_SAVED_ASSUMPTIONS;
  const baselineMinutes = input.applied * a.manualScreenMinutesPerApplicant;
  const reviewMinutes = input.humanDecided * a.manualScreenMinutesPerApplicant;
  const practicalMinutes = input.practicalGraded * a.practicalGradeMinutes;
  const writtenMinutes = input.basicNeedsHumanGrading * a.writtenGradeMinutesPerSubmission;
  const stagedMinutes = reviewMinutes + practicalMinutes + writtenMinutes;
  return {
    baselineMinutes,
    stagedMinutes,
    breakdown: { reviewMinutes, practicalMinutes, writtenMinutes },
    savedMinutes: baselineMinutes - stagedMinutes,
    assumptions: a,
  };
}

function spans(rows: ScreeningFunnelSnapshot[], from: (row: ScreeningFunnelSnapshot) => Date | null, to: (row: ScreeningFunnelSnapshot) => Date | null) {
  return rows.flatMap((row) => {
    const start = from(row);
    const end = to(row);
    if (!start || !end) return [];
    const ms = end.getTime() - start.getTime();
    return ms >= 0 ? [ms] : [];
  });
}

export function buildScreeningFunnel(rows: ScreeningFunnelSnapshot[]) {
  const applied = rows.length;
  const invited = rows.filter((row) => row.basicInvitedAt).length;
  const started = rows.filter((row) => row.basicInvitedAt && row.basicStartedAt).length;
  const submitted = rows.filter((row) => row.basicSubmittedAt).length;
  const graded = rows.filter((row) => row.basicSubmittedAt && row.basicGraded).length;
  const assigned = rows.filter((row) => row.practicalAssignedAt).length;
  const practicalSubmitted = rows.filter((row) => row.practicalSubmittedAt).length;
  const practicalGraded = rows.filter((row) => row.practicalSubmittedAt && row.practicalGraded).length;
  const advanced = rows.filter((row) => ADVANCED.includes(row.status) || row.shortlistedAt).length;
  const shortlisted = rows.filter((row) => row.shortlistedAt || row.status === "SHORTLISTED" || row.status === "SELECTED" || row.status === "HIRED").length;
  const hired = rows.filter((row) => row.status === ApplicationPipelineStatus.HIRED).length;
  return {
    steps: [
      step("applied", "Applied", applied, "applications in window", applied),
      step("basic-invited", "Basic assessment sent", invited, "applied", applied),
      step("basic-started", "Basic assessment started", started, "sent", invited),
      step("basic-submitted", "Basic assessment submitted", submitted, "sent", invited),
      step("basic-graded", "Basic assessment fully graded", graded, "submitted", submitted),
      step("practical-assigned", "Practical assigned", assigned, "applied", applied),
      step("practical-submitted", "Practical submitted", practicalSubmitted, "assigned", assigned),
      step("practical-graded", "Practical graded", practicalGraded, "submitted", practicalSubmitted),
      step("advanced", "Moved past CV pool", advanced, "applied", applied),
      step("shortlisted", "Shortlisted", shortlisted, "applied", applied),
      step("hired", "Hired", hired, "applied", applied),
    ],
    medians: {
      applyToBasicSubmitHours: medianHours(spans(rows, (row) => row.createdAt, (row) => row.basicSubmittedAt)),
      inviteToBasicSubmitHours: medianHours(spans(rows, (row) => row.basicInvitedAt, (row) => row.basicSubmittedAt)),
      assignToPracticalSubmitHours: medianHours(spans(rows, (row) => row.practicalAssignedAt, (row) => row.practicalSubmittedAt)),
      basicDurationMinutes: medianMinutes(spans(rows, (row) => row.basicStartedAt, (row) => row.basicSubmittedAt)),
    },
    timeSaved: estimateRecruiterTimeSaved({
      applied,
      humanDecided: rows.filter((row) => row.humanDecided).length,
      practicalGraded,
      basicNeedsHumanGrading: submitted - graded,
    }),
  };
}

export async function loadScreeningFunnel(jobId: number, companyId: number, windowDays: number, now = new Date()) {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const applications = await prisma.application.findMany({
    where: { jobId, companyId, createdAt: { gte: since } },
    select: { id: true, createdAt: true, status: true, shortlistedAt: true },
    take: 20_000,
  });
  const ids = applications.map((row) => row.id);
  const [generated, bank, practicals, decisions] = await Promise.all([
    prisma.generatedAssessmentInvite.findMany({
      where: { applicationId: { in: ids }, assessment: { jobId, companyId } },
      select: { applicationId: true, createdAt: true, startedAt: true, submittedAt: true, gradedAt: true, grades: true },
    }),
    prisma.assessmentInvite.findMany({
      where: { applicationId: { in: ids } },
      select: { applicationId: true, createdAt: true, startedAt: true, revokedAt: true, attempt: { select: { status: true, submittedAt: true } } },
    }),
    prisma.codingTest.findMany({
      where: { applicationId: { in: ids }, screeningPolicyId: { not: null } },
      select: { applicationId: true, assignedAt: true, submittedAt: true, gradedAt: true },
    }),
    prisma.decisionRecord.findMany({
      where: { applicationId: { in: ids }, companyId },
      distinct: ["applicationId"],
      select: { applicationId: true },
    }),
  ]);
  const decided = new Set(decisions.map((row) => row.applicationId));
  const earliest = (a: Date | null | undefined, b: Date | null | undefined) => (!a ? b ?? null : !b ? a : a < b ? a : b);
  const byApp = new Map<number, ScreeningFunnelSnapshot>(
    applications.map((row) => [
      row.id,
      {
        createdAt: row.createdAt,
        status: row.status,
        shortlistedAt: row.shortlistedAt,
        basicInvitedAt: null,
        basicStartedAt: null,
        basicSubmittedAt: null,
        basicGraded: false,
        practicalAssignedAt: null,
        practicalSubmittedAt: null,
        practicalGraded: false,
        humanDecided: decided.has(row.id),
      },
    ]),
  );
  for (const invite of generated) {
    const row = byApp.get(invite.applicationId);
    if (!row) continue;
    row.basicInvitedAt = earliest(row.basicInvitedAt, invite.createdAt);
    row.basicStartedAt = earliest(row.basicStartedAt, invite.startedAt);
    row.basicSubmittedAt = earliest(row.basicSubmittedAt, invite.submittedAt);
    const grades = Array.isArray(invite.grades) ? (invite.grades as Array<{ needsHuman?: boolean; score?: number | null }>) : [];
    if (invite.gradedAt && grades.length > 0 && grades.every((grade) => !grade.needsHuman && typeof grade.score === "number")) row.basicGraded = true;
  }
  for (const invite of bank) {
    const row = byApp.get(invite.applicationId);
    if (!row || invite.revokedAt) continue;
    row.basicInvitedAt = earliest(row.basicInvitedAt, invite.createdAt);
    row.basicStartedAt = earliest(row.basicStartedAt, invite.startedAt);
    if (invite.attempt?.status === "COMPLETED") {
      row.basicSubmittedAt = earliest(row.basicSubmittedAt, invite.attempt.submittedAt);
      row.basicGraded = true;
    }
  }
  for (const practical of practicals) {
    const row = byApp.get(practical.applicationId);
    if (!row) continue;
    row.practicalAssignedAt = earliest(row.practicalAssignedAt, practical.assignedAt);
    row.practicalSubmittedAt = earliest(row.practicalSubmittedAt, practical.submittedAt);
    if (practical.gradedAt) row.practicalGraded = true;
  }
  return { since, windowDays, ...buildScreeningFunnel([...byApp.values()]) };
}

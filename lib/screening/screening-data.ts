import { createHash } from "node:crypto";

import {
  ApplicationPipelineStatus,
  CandidateMatchResult,
  CandidateMatchRunStatus,
  EvidenceReviewStatus,
  RequirementApprovalStatus,
  RequirementOwnershipType,
  RequirementSupportState,
} from "@prisma/client";

import { parseAssessmentItems } from "@/lib/assessments/generated-assessment";
import { prisma } from "@/lib/prisma";
import { bankBasicResult, chooseBasicResult, generatedBasicResult } from "@/lib/screening/basic-result";
import { practicalStateOf } from "@/lib/screening/practical";
import {
  prioritizeCandidates,
  SCREENING_VIEWS,
  type CandidateEvaluation,
  type CandidateInput,
  type EvidenceInput,
  type PoolSummary,
  type PracticalInput,
  type ScreeningView,
} from "@/lib/screening/prioritization";
import { parseRubric, type ScreeningPolicy } from "@/lib/screening/screening-policy";
import { getCurrentScreeningPolicy } from "@/lib/screening/screening-policy-service";

/** Upper bound on one job's pool. Past this the page says the list is truncated. */
const POOL_LIMIT = 5000;
export const SCREENING_PAGE_SIZE = 25;

const PARSE_BADGES = new Set(["LOW_QUALITY", "OCR_DEFERRED", "OCR_EXHAUSTED"]);

export type ScreeningRow = {
  applicationId: number;
  name: string;
  title: string | null;
  currentEmployer: string | null;
  status: ApplicationPipelineStatus;
  closed: boolean;
  appliedAt: string;
  optedOut: boolean;
  humanReview: boolean;
  knockout: "pass" | "fail" | "none";
  parseIssue: boolean;
  basicSource: "generated" | "bank" | null;
  generatedInviteId: number | null;
  practicalId: number | null;
  /** True when essential requirements were approved for the job; otherwise eligibility is knockout-only. */
  requirementsApproved: boolean;
  evaluation: CandidateEvaluation;
};

export type ScreeningPool = {
  job: { id: number; title: string; companyId: number };
  policy: ScreeningPolicy;
  rows: ScreeningRow[];
  summary: PoolSummary;
  truncated: boolean;
  evidenceSource: "APPROVED_REQUIREMENTS" | "MATCHER_V1";
};

export function rubricVersionKey(rubric: unknown) {
  return `rubric:${createHash("sha256").update(JSON.stringify(parseRubric(rubric))).digest("hex").slice(0, 12)}`;
}

function latestBy<T extends { applicationId: number }>(rows: T[], newer: (a: T, b: T) => boolean) {
  const map = new Map<number, T>();
  for (const row of rows) {
    const current = map.get(row.applicationId);
    if (!current || newer(row, current)) map.set(row.applicationId, row);
  }
  return map;
}

/**
 * Loads and evaluates every application for one job with a fixed number of
 * queries. Ranking needs the whole pool, so filtering and paging happen
 * after evaluation, and only the requested page leaves the server.
 */
export async function loadScreeningPool(jobId: number, companyId: number, now = new Date()): Promise<ScreeningPool | null> {
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId }, select: { id: true, title: true, companyId: true } });
  if (!job) return null;
  const [policy, applications, approvedRequirements] = await Promise.all([
    getCurrentScreeningPolicy(job.id, companyId),
    prisma.application.findMany({
      where: { jobId: job.id, companyId },
      orderBy: { id: "asc" },
      take: POOL_LIMIT + 1,
      select: {
        id: true,
        status: true,
        createdAt: true,
        withdrawnAt: true,
        aiEvaluationOptOut: true,
        humanReviewRequestedAt: true,
        rejectionReasonCode: true,
        knockoutFailedAt: true,
        candidate: {
          select: {
            name: true,
            role: true,
            currentEmployer: true,
            _count: { select: { intelligenceClaims: { where: { claimType: "SKILL" } } } },
          },
        },
        resumeDocuments: { orderBy: { createdAt: "desc" }, take: 1, select: { parseErrorCode: true, ocrAttempts: true } },
        matchRuns: {
          where: { status: CandidateMatchRunStatus.COMPLETED },
          orderBy: { completedAt: "desc" },
          take: 1,
          select: { requirementMatches: { select: { result: true } } },
        },
      },
    }),
    prisma.jobRequirement.findMany({
      where: { jobId: job.id, companyId, approvalStatus: RequirementApprovalStatus.APPROVED },
      select: { id: true, requirementType: true },
    }),
  ]);
  const truncated = applications.length > POOL_LIMIT;
  const pool = truncated ? applications.slice(0, POOL_LIMIT) : applications;
  const ids = pool.map((row) => row.id);

  const [bankInvites, generatedInvites, practicals, v2Assessments, knockoutCount] = await Promise.all([
    prisma.assessmentInvite.findMany({
      where: { applicationId: { in: ids }, application: { companyId } },
      select: {
        applicationId: true,
        roleCategory: true,
        expiresAt: true,
        startedAt: true,
        revokedAt: true,
        attempt: { select: { status: true, score: true, maxScore: true } },
      },
    }),
    prisma.generatedAssessmentInvite.findMany({
      where: { applicationId: { in: ids }, assessment: { jobId: job.id, companyId } },
      select: { id: true, applicationId: true, assessmentId: true, startedAt: true, submittedAt: true, gradedAt: true, expiresAt: true, grades: true, createdAt: true },
    }),
    prisma.codingTest.findMany({
      where: { applicationId: { in: ids }, screeningPolicyId: { not: null }, application: { companyId } },
      select: {
        id: true,
        applicationId: true,
        submittedAt: true,
        gradedAt: true,
        dueAt: true,
        score: true,
        maxScore: true,
        screeningPolicy: { select: { practicalRubric: true } },
      },
    }),
    approvedRequirements.length > 0
      ? prisma.requirementAssessment.findMany({
          where: { companyId, applicationId: { in: ids }, jobRequirementId: { in: approvedRequirements.map((row) => row.id) } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { applicationId: true, jobRequirementId: true, supportState: true, reviewStatus: true, overriddenByUserId: true },
        })
      : Promise.resolve([]),
    prisma.knockoutQuestion.count({ where: { jobId: job.id, companyId } }),
  ]);

  const assessmentIds = [...new Set(generatedInvites.map((row) => row.assessmentId))];
  const assessments = assessmentIds.length
    ? await prisma.generatedAssessment.findMany({ where: { id: { in: assessmentIds }, companyId }, select: { id: true, items: true } })
    : [];
  const itemTypesByAssessment = new Map(
    assessments.map((row) => {
      const parsed = parseAssessmentItems(row.items);
      return [row.id, new Map(parsed.success ? parsed.data.map((item) => [item.id, item.type as string]) : [])];
    }),
  );

  const bankByApp = new Map(bankInvites.map((row) => [row.applicationId, row]));
  const generatedByApp = latestBy(generatedInvites, (a, b) => a.createdAt > b.createdAt || (a.createdAt.getTime() === b.createdAt.getTime() && a.id > b.id));
  const practicalByApp = latestBy(practicals, (a, b) => a.id > b.id);

  const latestV2 = new Map<string, (typeof v2Assessments)[number]>();
  for (const row of v2Assessments) {
    const key = `${row.applicationId}:${row.jobRequirementId}`;
    if (!latestV2.has(key)) latestV2.set(key, row);
  }
  const v2Apps = new Set(v2Assessments.map((row) => row.applicationId));
  const evidenceSource: ScreeningPool["evidenceSource"] = approvedRequirements.length > 0 && v2Apps.size > 0 ? "APPROVED_REQUIREMENTS" : "MATCHER_V1";
  const required = approvedRequirements.filter((row) => row.requirementType === RequirementOwnershipType.REQUIRED);

  const meta = new Map<number, Omit<ScreeningRow, "evaluation">>();
  const inputs: CandidateInput[] = pool.map((application) => {
    const closed =
      Boolean(application.withdrawnAt) ||
      application.status === ApplicationPipelineStatus.REJECTED ||
      application.status === ApplicationPipelineStatus.HIRED;

    const generated = generatedByApp.get(application.id);
    const bank = bankByApp.get(application.id);
    const generatedResult = generated
      ? generatedBasicResult(generated, itemTypesByAssessment.get(generated.assessmentId) ?? new Map(), now)
      : null;
    const bankResult = bank
      ? bankBasicResult({ ...bank, roleCategory: String(bank.roleCategory), attempt: bank.attempt ? { ...bank.attempt, status: bank.attempt.status } : null }, now)
      : null;
    const basic = chooseBasicResult(generatedResult, bankResult);
    const basicSource = basic === generatedResult && generatedResult ? "generated" : bankResult && basic === bankResult ? "bank" : null;

    const practicalRow = practicalByApp.get(application.id);
    let practical: PracticalInput = { state: "NOT_ASSIGNED" };
    if (practicalRow) {
      const state = practicalStateOf({ submittedAt: practicalRow.submittedAt, gradedAt: practicalRow.gradedAt, dueAt: practicalRow.dueAt, now });
      const versionKey = rubricVersionKey(practicalRow.screeningPolicy?.practicalRubric);
      practical =
        state === "GRADED" && practicalRow.maxScore > 0
          ? { state: "GRADED", percent: (practicalRow.score / practicalRow.maxScore) * 100, versionKey }
          : state === "GRADED" || state === "PENDING_GRADING"
            ? { state: "PENDING_GRADING", versionKey }
            : state === "OVERDUE"
              ? { state: "OVERDUE" }
              : { state: "ASSIGNED", dueAt: practicalRow.dueAt };
    }

    let evidence: EvidenceInput;
    let requiredNotMet = 0;
    let requiredUnknown = 0;
    if (required.length > 0) {
      for (const requirement of required) {
        const row = latestV2.get(`${application.id}:${requirement.id}`);
        if (row?.reviewStatus === EvidenceReviewStatus.NOT_MET && row.overriddenByUserId !== null) requiredNotMet += 1;
        else if (!(row && (row.reviewStatus === EvidenceReviewStatus.MEETS || row.supportState === RequirementSupportState.SUPPORTED))) requiredUnknown += 1;
      }
    }
    if (application.aiEvaluationOptOut) {
      evidence = { state: "OPTED_OUT" };
    } else if (evidenceSource === "APPROVED_REQUIREMENTS") {
      if (!v2Apps.has(application.id)) evidence = { state: "NOT_ANALYSED" };
      else {
        const supported = approvedRequirements.filter((requirement) => {
          const row = latestV2.get(`${application.id}:${requirement.id}`);
          return row && (row.reviewStatus === EvidenceReviewStatus.MEETS || row.supportState === RequirementSupportState.SUPPORTED);
        }).length;
        evidence = { state: "ANALYSED", supported, total: approvedRequirements.length, source: "APPROVED_REQUIREMENTS" };
      }
    } else {
      const matches = application.matchRuns[0]?.requirementMatches ?? [];
      const analysed = application.candidate._count.intelligenceClaims > 0;
      evidence =
        !analysed || application.matchRuns.length === 0
          ? { state: "NOT_ANALYSED" }
          : matches.length === 0
            ? { state: "NO_REQUIREMENTS" }
            : {
                state: "ANALYSED",
                supported: matches.filter((match) => match.result === CandidateMatchResult.SATISFIED).length,
                total: matches.length,
                source: "MATCHER_V1",
              };
    }

    const resume = application.resumeDocuments[0];
    const parseIssue = Boolean(resume && ((resume.parseErrorCode && PARSE_BADGES.has(resume.parseErrorCode)) || resume.ocrAttempts >= 3));
    const knockoutFailed = application.knockoutFailedAt !== null || application.rejectionReasonCode === "KNOCKOUT";
    meta.set(application.id, {
      applicationId: application.id,
      name: application.candidate.name,
      title: application.candidate.role,
      currentEmployer: application.candidate.currentEmployer,
      status: application.status,
      closed,
      appliedAt: application.createdAt.toISOString(),
      optedOut: application.aiEvaluationOptOut,
      humanReview: application.humanReviewRequestedAt !== null,
      knockout: knockoutFailed ? "fail" : knockoutCount > 0 ? "pass" : "none",
      parseIssue,
      basicSource,
      generatedInviteId: generated?.id ?? null,
      practicalId: practicalRow?.id ?? null,
      requirementsApproved: required.length > 0,
    });
    return {
      applicationId: application.id,
      closed,
      humanReviewRequested: application.humanReviewRequestedAt !== null,
      parseIssue,
      basic,
      practical,
      evidence,
      eligibility: { knockoutFailed, requiredNotMet, requiredUnknown },
    };
  });

  const { evaluations, summary } = prioritizeCandidates(inputs, policy);
  const rows = evaluations.map((evaluation) => ({ ...meta.get(evaluation.applicationId)!, evaluation }));
  return { job, policy, rows, summary, truncated, evidenceSource };
}

export type ScreeningSort = "priority" | "combined" | "basic" | "practical" | "evidence" | "applied" | "name";

export type ScreeningQuery = {
  view: ScreeningView;
  sort: ScreeningSort;
  stage: string;
  search: string;
  flag: string;
  page: number;
};

const SORTS = new Set<ScreeningSort>(["priority", "combined", "basic", "practical", "evidence", "applied", "name"]);
const VIEWS = new Set<ScreeningView>(SCREENING_VIEWS.map((option) => option.key));

export function parseScreeningQuery(params: Record<string, string | string[] | undefined>): ScreeningQuery {
  const first = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };
  const view = first("view") as ScreeningView;
  const sort = first("sort") as ScreeningSort;
  const page = Number.parseInt(first("page"), 10);
  return {
    view: VIEWS.has(view) ? view : "top",
    sort: SORTS.has(sort) ? sort : "priority",
    stage: Object.values(ApplicationPipelineStatus).includes(first("stage") as ApplicationPipelineStatus) ? first("stage") : "",
    search: first("q").trim().slice(0, 80),
    flag: /^[A-Z_]{3,40}$/.test(first("flag")) ? first("flag") : "",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

function nullsLast(a: number | null, b: number | null) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

export function sortScreeningRows(rows: ScreeningRow[], sort: ScreeningSort) {
  const byId = (a: ScreeningRow, b: ScreeningRow) => a.applicationId - b.applicationId;
  return [...rows].sort((a, b) => {
    switch (sort) {
      case "combined":
        return nullsLast(a.evaluation.combined, b.evaluation.combined) || byId(a, b);
      case "basic":
        return nullsLast(a.evaluation.components.basic.percent, b.evaluation.components.basic.percent) || byId(a, b);
      case "practical":
        return nullsLast(a.evaluation.components.practical.percent, b.evaluation.components.practical.percent) || byId(a, b);
      case "evidence":
        return nullsLast(a.evaluation.components.evidence.percent, b.evaluation.components.evidence.percent) || byId(a, b);
      case "applied":
        return b.appliedAt.localeCompare(a.appliedAt) || byId(a, b);
      case "name":
        return a.name.localeCompare(b.name) || byId(a, b);
      default:
        return (
          nullsLast(a.evaluation.rank === null ? null : -a.evaluation.rank, b.evaluation.rank === null ? null : -b.evaluation.rank) ||
          b.evaluation.completeness.present - a.evaluation.completeness.present ||
          byId(a, b)
        );
    }
  });
}

export function queryScreeningPool(pool: ScreeningPool, query: ScreeningQuery) {
  const search = query.search.toLowerCase();
  const filtered = pool.rows.filter((row) => {
    if (!row.evaluation.views.includes(query.view)) return false;
    if (query.stage && row.status !== query.stage) return false;
    if (query.flag && !row.evaluation.flags.some((flag) => flag.code === query.flag)) return false;
    if (search && !`${row.name} ${row.title ?? ""} ${row.currentEmployer ?? ""}`.toLowerCase().includes(search)) return false;
    return true;
  });
  const sorted = sortScreeningRows(filtered, query.sort);
  const pageCount = Math.max(1, Math.ceil(sorted.length / SCREENING_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  return {
    rows: sorted.slice((page - 1) * SCREENING_PAGE_SIZE, page * SCREENING_PAGE_SIZE),
    total: sorted.length,
    page,
    pageCount,
  };
}

/** One line kept with a decision so later reviewers can see what was on screen. */
export async function screeningSnapshot(jobId: number, companyId: number, applicationId: number) {
  const pool = await loadScreeningPool(jobId, companyId);
  const row = pool?.rows.find((entry) => entry.applicationId === applicationId);
  if (!pool || !row) return null;
  const { components, combined, standard, eligibility, rank } = row.evaluation;
  const pct = (value: number | null) => (value === null ? "-" : value.toFixed(1));
  return [
    `policy v${pool.policy.version ?? "default"}`,
    `basic ${pct(components.basic.percent)}`,
    `practical ${pct(components.practical.percent)}`,
    `evidence ${pct(components.evidence.percent)}`,
    `combined ${pct(combined)}`,
    `rank ${rank ?? "-"}`,
    `standard ${standard}`,
    `eligibility ${eligibility}`,
  ].join(", ");
}

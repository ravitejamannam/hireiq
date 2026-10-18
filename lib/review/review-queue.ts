import type { ApplicationPipelineStatus } from "@prisma/client";

export const REVIEW_PAGE_SIZE = 50;

export const REVIEW_REJECT_REASONS = [
  "Not enough relevant experience",
  "Missing required skill",
  "Compensation mismatch",
  "Location mismatch",
  "Failed knockout",
] as const;

export type ReviewRejectReason = (typeof REVIEW_REJECT_REASONS)[number];

export type ReviewParseBadge = "LOW_QUALITY" | "OCR_DEFERRED" | "OCR_EXHAUSTED" | null;

export type ReviewRow = {
  id: number;
  name: string;
  title: string | null;
  company: string | null;
  status: ApplicationPipelineStatus;
  score: number | null;
  analysed: boolean;
  optedOut: boolean;
  humanReview: boolean;
  quotes: string[];
  knockout: "pass" | "fail" | "unanswered";
  parseStatus: ReviewParseBadge;
};

export type ReviewFilters = {
  stage: string;
  minScore: string;
  maxScore: string;
  knockout: string;
  parse: string;
  human: string;
};

export function displayScore(row: Pick<ReviewRow, "optedOut" | "score">) {
  if (row.optedOut) return null;
  return row.score;
}

export function scoreLabel(row: Pick<ReviewRow, "optedOut" | "score" | "analysed">) {
  if (row.optedOut) return "Manual review";
  if (!row.analysed) return "Not analysed yet";
  if (row.score === null) return "No score";
  return `${Math.round(row.score * 100)}%`;
}

export function isReviewRejectReason(value: string): value is ReviewRejectReason {
  return (REVIEW_REJECT_REASONS as readonly string[]).includes(value);
}

export function bulkRejectPlan(rows: ReviewRow[], ids: number[]) {
  const selected = rows.filter((row) => ids.includes(row.id));
  return {
    allowed: selected.filter((row) => !row.humanReview).map((row) => row.id),
    blocked: selected.filter((row) => row.humanReview).map((row) => row.id),
  };
}

export function filterReviewRows(rows: ReviewRow[], filters: ReviewFilters) {
  const min = filters.minScore === "" ? null : Number(filters.minScore);
  const max = filters.maxScore === "" ? null : Number(filters.maxScore);
  return rows.filter((row) => {
    if (filters.stage && row.status !== filters.stage) return false;
    if (filters.human === "yes" && !row.humanReview) return false;
    if (filters.human === "no" && row.humanReview) return false;
    if (filters.knockout && row.knockout !== filters.knockout) return false;
    if (filters.parse === "ok" && row.parseStatus) return false;
    if (filters.parse && filters.parse !== "ok" && row.parseStatus !== filters.parse) return false;
    const score = displayScore(row);
    if (min !== null && (score === null || score < min)) return false;
    if (max !== null && (score === null || score > max)) return false;
    return true;
  });
}

function rankScore(score: number | null) {
  if (score === null || score <= 0) return 0;
  return score;
}

export function sortByScore(rows: ReviewRow[]) {
  return [...rows].sort((left, right) => {
    const a = rankScore(displayScore(left));
    const b = rankScore(displayScore(right));
    if (a === 0 && b === 0) return left.id - right.id;
    if (a === 0) return 1;
    if (b === 0) return -1;
    return b - a || left.id - right.id;
  });
}

export type ReviewKey =
  | "next"
  | "previous"
  | "advance"
  | "shortlist"
  | "reject"
  | "open"
  | "undo"
  | "help";

export function reviewKey(key: string): ReviewKey | null {
  const normalized = key.length === 1 ? key.toLowerCase() : key;
  switch (normalized) {
    case "j":
      return "next";
    case "k":
      return "previous";
    case "a":
      return "advance";
    case "s":
      return "shortlist";
    case "r":
      return "reject";
    case "o":
      return "open";
    case "u":
      return "undo";
    case "?":
      return "help";
    default:
      return null;
  }
}

export function moveSelection(index: number, length: number, direction: "next" | "previous") {
  if (length === 0) return 0;
  if (direction === "next") return Math.min(index + 1, length - 1);
  return Math.max(index - 1, 0);
}

export function auditReason(reason: string | null, score: number | null, optedOut: boolean) {
  const scoreText = optedOut || score === null ? "aiScore=manual" : `aiScore=${score.toFixed(2)}`;
  return reason ? `${reason} | ${scoreText}` : scoreText;
}

const ADVANCE: Partial<Record<ApplicationPipelineStatus, ApplicationPipelineStatus>> = {
  CV_POOL: "EXPERT_REVIEW",
  EXPERT_REVIEW: "TECH_EVALUATION",
  TECH_EVALUATION: "SHORTLISTED",
};

export function advanceStatus(status: ApplicationPipelineStatus) {
  return ADVANCE[status] ?? null;
}

export function shortlistStatus(status: ApplicationPipelineStatus) {
  return status === "TECH_EVALUATION" ? "SHORTLISTED" : null;
}

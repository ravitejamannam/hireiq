import type {
  ApplicationPipelineStatus,
  CodingTestStatus,
  InterviewResult,
  InterviewType,
  JobStatus,
  RequirementLifecycle,
} from "@prisma/client";

import { requirementLifecycleLabels } from "@/components/jobs/JobCard";

export const clientJobStatusLabels: Record<JobStatus, string> = {
  OPEN: "Open",
  CLOSED: "Closed",
  FILLED: "Filled",
};

export { requirementLifecycleLabels as clientRequirementLifecycleLabels };

export function formatClientDate(value: Date | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

export function formatClientDateTime(value: Date | null | undefined) {
  if (!value || Number.isNaN(value.getTime())) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export const clientInterviewTypeLabels: Record<InterviewType, string> = {
  PHONE_SCREEN: "Phone Screen",
  TECHNICAL: "Technical",
  SYSTEM_DESIGN: "System Design",
  HR: "HR",
};

export const clientInterviewResultLabels: Record<InterviewResult, string> = {
  PENDING: "Pending",
  PASSED: "Passed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const clientCodingTestStatusLabels: Record<CodingTestStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export function getClientInterviewTypeLabel(type: InterviewType) {
  return clientInterviewTypeLabels[type];
}

export function getClientInterviewResultLabel(result: InterviewResult) {
  return clientInterviewResultLabels[result];
}

export function getClientCodingTestStatusLabel(status: CodingTestStatus) {
  return clientCodingTestStatusLabels[status];
}

export type ClientPipelineCounts = {
  cvPool: number;
  expertReview: number;
  techEvaluation: number;
  shortlisted: number;
  selected: number;
  hired: number;
};

export function countPipelineStatuses(
  statuses: ApplicationPipelineStatus[],
): ClientPipelineCounts {
  return {
    cvPool: statuses.filter((status) => status === "CV_POOL").length,
    expertReview: statuses.filter((status) => status === "EXPERT_REVIEW")
      .length,
    techEvaluation: statuses.filter((status) => status === "TECH_EVALUATION")
      .length,
    shortlisted: statuses.filter((status) => status === "SHORTLISTED").length,
    selected: statuses.filter((status) => status === "SELECTED").length,
    hired: statuses.filter((status) => status === "HIRED").length,
  };
}

export type ClientScorecardEntry = {
  skill: string;
  score: number;
  comment: string | null;
};

export const clientPipelineStatusLabels: Record<
  ApplicationPipelineStatus,
  string
> = {
  CV_POOL: "CV Pool",
  EXPERT_REVIEW: "Expert Review",
  TECH_EVALUATION: "Tech Evaluation",
  SHORTLISTED: "Shortlisted",
  SELECTED: "Selected",
  REJECTED: "Rejected",
  HIRED: "Hired",
};

export const clientRecommendationLabels: Record<string, string> = {
  STRONG_HIRE: "Strong Hire",
  HIRE: "Hire",
  NO_HIRE: "No Hire",
  STRONG_NO_HIRE: "Strong No Hire",
};

export const clientFitDecisionLabels: Record<string, string> = {
  RIGHT_FIT: "Right Fit",
  NOT_FIT: "Not Fit",
};

export const clientSourceLabels: Record<string, string> = {
  LINKEDIN: "LinkedIn",
  NAUKRI: "Naukri",
  HOSTED_APPLY: "Hosted apply",
  INDEED: "Indeed",
  REFERRAL: "Referral",
  MANUAL: "Manual",
};

export function formatClientOptional(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  return String(value);
}

export function getClientPipelineStatusLabel(
  status: ApplicationPipelineStatus,
) {
  return clientPipelineStatusLabels[status] ?? status;
}

export function getClientRecommendationLabel(
  recommendation: string | null | undefined,
) {
  if (!recommendation) return "Not set";
  return clientRecommendationLabels[recommendation] ?? recommendation;
}

export function getClientFitDecisionLabel(
  fitDecision: string | null | undefined,
) {
  if (!fitDecision) return "Not set";
  return clientFitDecisionLabels[fitDecision] ?? fitDecision;
}

export function getClientSourceLabel(source: string | null | undefined) {
  if (!source) return "Not set";
  return clientSourceLabels[source] ?? source;
}

export function getClientTechnicalEvaluationStatus(evaluation: {
  evaluatedAt: Date | string | null;
  overallScore: number | null;
} | null) {
  if (!evaluation) {
    return "Not started";
  }

  if (evaluation.evaluatedAt || evaluation.overallScore !== null) {
    return "Completed";
  }

  return "In progress";
}

/**
 * Prefer the most recent completed evaluation (evaluatedAt set).
 * If none are completed, fall back to the most recently created evaluation.
 */
export function selectPrimaryClientEvaluation<
  T extends {
    evaluatedAt: Date | string | null;
    createdAt: Date | string;
  },
>(evaluations: T[]): T | null {
  if (evaluations.length === 0) {
    return null;
  }

  const toTime = (value: Date | string) => new Date(value).getTime();

  const completed = evaluations.filter((evaluation) => evaluation.evaluatedAt);

  const pool = completed.length > 0 ? completed : evaluations;

  return [...pool].sort((left, right) => {
    const leftTime = toTime(left.evaluatedAt ?? left.createdAt);
    const rightTime = toTime(right.evaluatedAt ?? right.createdAt);
    return rightTime - leftTime;
  })[0];
}

export function parseClientScorecard(
  scorecard: unknown,
): ClientScorecardEntry[] | null {
  if (!scorecard) {
    return null;
  }

  let value: unknown = scorecard;

  if (typeof scorecard === "string") {
    const trimmed = scorecard.trim();
    if (!trimmed) {
      return null;
    }

    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const entries = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      if (typeof record.skill !== "string" || typeof record.score !== "number") {
        return null;
      }

      return {
        skill: record.skill,
        score: record.score,
        comment: typeof record.comment === "string" ? record.comment : null,
      };
    })
    .filter((entry): entry is ClientScorecardEntry => entry !== null);

  return entries.length > 0 ? entries : null;
}

export function matchesClientCandidateSearch(
  candidate: {
    name: string;
    role: string;
    currentEmployer: string | null;
    location: string | null;
    skills: string | null;
  },
  query: string,
) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    candidate.name.toLowerCase().includes(normalized) ||
    candidate.role.toLowerCase().includes(normalized) ||
    (candidate.currentEmployer ?? "").toLowerCase().includes(normalized) ||
    (candidate.location ?? "").toLowerCase().includes(normalized) ||
    (candidate.skills ?? "").toLowerCase().includes(normalized)
  );
}

export function formatRelativePosted(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const deltaMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(deltaMs / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return formatClientDate(date);
}

export function matchesClientRequirementSearch(
  requirement: {
    title: string;
    location: string | null;
    status: JobStatus;
    requirementLifecycle: RequirementLifecycle;
  },
  query: string,
) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const lifecycleLabel =
    requirementLifecycleLabels[requirement.requirementLifecycle].toLowerCase();
  const statusLabel = clientJobStatusLabels[requirement.status].toLowerCase();

  return (
    requirement.title.toLowerCase().includes(normalized) ||
    (requirement.location ?? "").toLowerCase().includes(normalized) ||
    lifecycleLabel.includes(normalized) ||
    statusLabel.includes(normalized)
  );
}

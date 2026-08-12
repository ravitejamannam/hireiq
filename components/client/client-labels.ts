import type {
  ApplicationPipelineStatus,
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

import { ApplicationPipelineStatus } from "@prisma/client";

/** Shown while useSearchParams suspends. Must not read as an empty pipeline. */
export const PIPELINE_LOADING_MESSAGE = "Loading pipeline";

export const PIPELINE_COLUMNS: ApplicationPipelineStatus[] = [
  ApplicationPipelineStatus.CV_POOL,
  ApplicationPipelineStatus.EXPERT_REVIEW,
  ApplicationPipelineStatus.TECH_EVALUATION,
  ApplicationPipelineStatus.SHORTLISTED,
  ApplicationPipelineStatus.SELECTED,
  ApplicationPipelineStatus.HIRED,
  ApplicationPipelineStatus.REJECTED,
];

export function applicationsForRequirement<T extends { jobId: number }>(
  applications: T[],
  requirementId: number | null,
): T[] {
  if (requirementId === null) {
    return applications;
  }
  return applications.filter((application) => application.jobId === requirementId);
}

import { ApplicationPipelineStatus } from "@prisma/client";

/**
 * Admin operational pipeline. SELECTED and HIRED are Client-owned.
 */
export const ADMIN_PIPELINE_TRANSITIONS: Record<
  ApplicationPipelineStatus,
  ApplicationPipelineStatus[]
> = {
  [ApplicationPipelineStatus.CV_POOL]: [
    ApplicationPipelineStatus.EXPERT_REVIEW,
    ApplicationPipelineStatus.REJECTED,
  ],
  [ApplicationPipelineStatus.EXPERT_REVIEW]: [
    ApplicationPipelineStatus.TECH_EVALUATION,
    ApplicationPipelineStatus.REJECTED,
  ],
  [ApplicationPipelineStatus.TECH_EVALUATION]: [
    ApplicationPipelineStatus.SHORTLISTED,
    ApplicationPipelineStatus.REJECTED,
  ],
  [ApplicationPipelineStatus.SHORTLISTED]: [
    ApplicationPipelineStatus.REJECTED,
  ],
  [ApplicationPipelineStatus.SELECTED]: [],
  [ApplicationPipelineStatus.REJECTED]: [],
  [ApplicationPipelineStatus.HIRED]: [],
};

/**
 * Interviewer recommendation pipeline for assigned requirements.
 * Does not include SELECT or HIRE.
 */
export const INTERVIEWER_PIPELINE_TRANSITIONS: Record<
  ApplicationPipelineStatus,
  ApplicationPipelineStatus[]
> = {
  [ApplicationPipelineStatus.CV_POOL]: [],
  [ApplicationPipelineStatus.EXPERT_REVIEW]: [],
  [ApplicationPipelineStatus.TECH_EVALUATION]: [
    ApplicationPipelineStatus.SHORTLISTED,
    ApplicationPipelineStatus.REJECTED,
  ],
  [ApplicationPipelineStatus.SHORTLISTED]: [],
  [ApplicationPipelineStatus.SELECTED]: [],
  [ApplicationPipelineStatus.REJECTED]: [],
  [ApplicationPipelineStatus.HIRED]: [],
};

export function getValidAdminPipelineTransitions(
  currentStatus: ApplicationPipelineStatus,
) {
  return ADMIN_PIPELINE_TRANSITIONS[currentStatus] ?? [];
}

export function getValidInterviewerPipelineTransitions(
  currentStatus: ApplicationPipelineStatus,
) {
  return INTERVIEWER_PIPELINE_TRANSITIONS[currentStatus] ?? [];
}

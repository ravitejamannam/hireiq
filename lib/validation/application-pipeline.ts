import {
  ApplicationPipelineStatus,
  RequirementLifecycle,
} from "@prisma/client";

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

export function getAdminApplicationFormStatuses(
  currentStatus: ApplicationPipelineStatus | null,
) {
  if (currentStatus === null) {
    return [ApplicationPipelineStatus.CV_POOL];
  }

  const allowedNext = getValidAdminPipelineTransitions(currentStatus);
  return [currentStatus, ...allowedNext];
}

/**
 * Client SELECT / HIRE (and hire billing) may run during sourcing
 * or after the first hire has already marked BILLING_GENERATED.
 * T70 shortlistingCompletedAt is a communication handoff, not a hiring gate.
 */
export const CLIENT_HIRING_REQUIREMENT_LIFECYCLES: RequirementLifecycle[] = [
  RequirementLifecycle.SOURCING_SHORTLISTING,
  RequirementLifecycle.BILLING_GENERATED,
];

export function jobAllowsClientHiringAction(
  requirementLifecycle: RequirementLifecycle,
) {
  return CLIENT_HIRING_REQUIREMENT_LIFECYCLES.includes(requirementLifecycle);
}

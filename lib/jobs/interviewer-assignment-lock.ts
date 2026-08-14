import { RequirementLifecycle } from "@prisma/client";

/**
 * Once T68 has moved the requirement to INTERVIEWER_NOTIFIED, the assigned
 * interviewer is frozen. Later lifecycle stages inherit that lock.
 */
export const INTERVIEWER_ASSIGNMENT_LOCKED_LIFECYCLES = [
  RequirementLifecycle.INTERVIEWER_NOTIFIED,
  RequirementLifecycle.SOURCING_SHORTLISTING,
  RequirementLifecycle.BILLING_GENERATED,
] as const;

export function isInterviewerAssignmentLocked(
  lifecycle: RequirementLifecycle,
) {
  return INTERVIEWER_ASSIGNMENT_LOCKED_LIFECYCLES.some(
    (locked) => locked === lifecycle,
  );
}

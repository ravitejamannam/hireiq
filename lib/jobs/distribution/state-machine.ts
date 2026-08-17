import { JobDistributionStatus } from "@prisma/client";

export const DISTRIBUTION_TRANSITIONS: Record<
  JobDistributionStatus,
  readonly JobDistributionStatus[]
> = {
  DISABLED: ["READY"],
  READY: ["DISABLED", "PUBLISHING", "CLOSED"],
  PUBLISHING: ["PUBLISHED", "FAILED"],
  PUBLISHED: ["PAUSED", "CLOSING"],
  PAUSED: ["PUBLISHED", "CLOSING"],
  CLOSING: ["CLOSED", "FAILED"],
  CLOSED: [],
  FAILED: ["READY", "PUBLISHING", "CLOSED"],
};

export function canTransitionDistribution(
  from: JobDistributionStatus,
  to: JobDistributionStatus,
) {
  return DISTRIBUTION_TRANSITIONS[from].includes(to);
}

export function isActiveDistributionStatus(status: JobDistributionStatus) {
  return status !== JobDistributionStatus.CLOSED;
}

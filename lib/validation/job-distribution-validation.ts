import {
  ApplyMode,
  DistributionProvider,
  JobDistributionStatus,
  JobStatus,
  JobSpecificationVersionStatus,
} from "@prisma/client";

import { canTransitionDistribution } from "@/lib/jobs/distribution/state-machine";

export class JobDistributionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobDistributionError";
  }
}

export const DISTRIBUTION_NOT_FOUND = "Distribution not found.";
export const JOB_NOT_FOUND = "Requirement not found.";
export const JOB_NOT_OPEN = "Job is not open for distribution.";
export const PUBLISHED_SPEC_REQUIRED =
  "A published specification is required to distribute this job.";
export const DRAFT_CANNOT_DISTRIBUTE =
  "Draft specifications cannot be distributed.";
export const APPLY_URL_REQUIRED = "An apply URL is required.";
export const MANUAL_DISTRIBUTION_ACTIVE =
  "Close the existing Manual distribution before enabling HireIQ hosted apply.";
export const APPLY_URL_INVALID = "Apply URL is invalid.";
export const CONNECTION_REQUIRED = "A provider connection is required.";
export const CONNECTION_INACTIVE = "Provider connection is not active.";
export const DUPLICATE_DISTRIBUTION =
  "An active distribution already exists for this provider.";
export const INVALID_TRANSITION = "Invalid distribution status transition.";
export const PROVIDER_UNAVAILABLE_MESSAGE = "This provider is not available.";

export function validatePositiveInteger(value: unknown, message: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new JobDistributionError(message);
  }

  return value;
}

export function validateJobDistributionId(id: unknown) {
  return validatePositiveInteger(id, "Distribution ID must be a positive integer.");
}

export function validateDistributionJobId(id: unknown) {
  return validatePositiveInteger(id, "Job ID must be a positive integer.");
}

export function validateDistributionProvider(provider: unknown) {
  if (
    typeof provider !== "string" ||
    !Object.values(DistributionProvider).includes(
      provider as DistributionProvider,
    )
  ) {
    throw new JobDistributionError("Distribution provider is invalid.");
  }

  return provider as DistributionProvider;
}

export function validateApplyMode(applyMode: unknown) {
  if (
    typeof applyMode !== "string" ||
    !Object.values(ApplyMode).includes(applyMode as ApplyMode)
  ) {
    throw new JobDistributionError("Apply mode is invalid.");
  }

  return applyMode as ApplyMode;
}

export function validateOptionalAccountId(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new JobDistributionError("Provider account id is invalid.");
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

export function validateCredentialSecret(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new JobDistributionError("Provider credential is required.");
  }

  if (value.length > 8000) {
    throw new JobDistributionError("Provider credential is too long.");
  }

  return value;
}

export function validateApplyUrlSnapshot(
  applyMode: ApplyMode,
  applyUrl: unknown,
) {
  if (applyMode === ApplyMode.HIREIQ_HOSTED) {
    return null;
  }

  if (applyMode !== ApplyMode.EXTERNAL_URL) {
    return null;
  }

  if (typeof applyUrl !== "string" || !applyUrl.trim()) {
    throw new JobDistributionError(APPLY_URL_REQUIRED);
  }

  const trimmed = applyUrl.trim();
  if (trimmed.length > 2048) {
    throw new JobDistributionError(APPLY_URL_INVALID);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new JobDistributionError(APPLY_URL_INVALID);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new JobDistributionError(APPLY_URL_INVALID);
  }

  return trimmed;
}

export function validateIncludeCompensation(value: unknown) {
  return value === true;
}

export function assertJobIsDistributable(job: {
  status: JobStatus;
  currentPublishedSpecificationVersionId: number | null;
}) {
  if (job.status !== JobStatus.OPEN) {
    throw new JobDistributionError(JOB_NOT_OPEN);
  }

  if (!job.currentPublishedSpecificationVersionId) {
    throw new JobDistributionError(PUBLISHED_SPEC_REQUIRED);
  }
}

export function assertPublishedSpecification(version: {
  id: number;
  jobId: number;
  status: JobSpecificationVersionStatus;
} | null, jobId: number) {
  if (!version) {
    throw new JobDistributionError(PUBLISHED_SPEC_REQUIRED);
  }

  if (version.jobId !== jobId) {
    throw new JobDistributionError(PUBLISHED_SPEC_REQUIRED);
  }

  if (version.status !== JobSpecificationVersionStatus.PUBLISHED) {
    throw new JobDistributionError(DRAFT_CANNOT_DISTRIBUTE);
  }

  return version;
}

export function assertDistributionTransition(
  from: JobDistributionStatus,
  to: JobDistributionStatus,
) {
  if (!canTransitionDistribution(from, to)) {
    throw new JobDistributionError(INVALID_TRANSITION);
  }
}

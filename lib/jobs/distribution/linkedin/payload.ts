import { ApplyMode } from "@prisma/client";

import type { PublicDistributionPayload } from "@/lib/jobs/distribution/payload";

/**
 * LinkedIn-facing mapping of the public distribution DTO.
 * Not an official LinkedIn Job Posting API schema. T86 does not call LinkedIn.
 */
export type LinkedInMappedPayload = {
  title: string;
  description: string | null;
  location: string | null;
  experienceRange: string | null;
  primarySkills: string | null;
  mustHaveRequirements: string | null;
  niceToHaveRequirements: string | null;
  numberOfPositions: number | null;
  compensationRange: string | null;
  applyMode: ApplyMode;
  applyUrl: string | null;
  companyName: string | null;
};

export function mapPublicPayloadToLinkedIn(
  payload: PublicDistributionPayload,
): LinkedInMappedPayload {
  return {
    title: payload.title,
    description: payload.jobDescription,
    location: payload.location,
    experienceRange: payload.experienceRange,
    primarySkills: payload.primarySkills,
    mustHaveRequirements: payload.mustHaveRequirements,
    niceToHaveRequirements: payload.niceToHaveRequirements,
    numberOfPositions: payload.numberOfPositions,
    compensationRange: payload.compensationRange,
    applyMode: payload.applyMode,
    applyUrl:
      payload.applyMode === ApplyMode.PROVIDER_NATIVE ? null : payload.applyUrl,
    companyName: payload.companyDisplayName,
  };
}

export function assertLinkedInMappedPayloadHasNoInternalFields(
  mapped: LinkedInMappedPayload,
) {
  const record = mapped as LinkedInMappedPayload & Record<string, unknown>;
  return (
    !("evaluationCriteria" in record) &&
    !("targetHireDate" in record) &&
    !("structuredPayload" in record) &&
    !("aiProposedJobDescription" in record) &&
    !("companyId" in record) &&
    !("jobId" in record) &&
    !("requirementLifecycle" in record)
  );
}

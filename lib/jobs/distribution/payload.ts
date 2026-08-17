import type {
  ApplyMode,
  JobSpecificationVersion,
  RoleCategory,
} from "@prisma/client";

export type PublicDistributionPayload = {
  title: string;
  roleCategory: RoleCategory | null;
  experienceRange: string | null;
  location: string | null;
  jobDescription: string | null;
  mustHaveRequirements: string | null;
  niceToHaveRequirements: string | null;
  primarySkills: string | null;
  numberOfPositions: number | null;
  compensationRange: string | null;
  applyMode: ApplyMode;
  applyUrl: string | null;
  companyDisplayName: string | null;
};

export type InternalDistributionFields = {
  evaluationCriteria: string | null;
  targetHireDate: Date | null;
  structuredPayload: unknown;
  aiProposedJobDescription: string | null;
};

/**
 * Provider-neutral public DTO. Canonical source is a PUBLISHED
 * JobSpecificationVersion. Never include evaluationCriteria,
 * targetHireDate, structuredPayload, or AI proposals.
 */
export function buildPublicDistributionPayload(input: {
  version: Pick<
    JobSpecificationVersion,
    | "title"
    | "roleCategory"
    | "experienceRange"
    | "location"
    | "jobDescription"
    | "mustHaveRequirements"
    | "niceToHaveRequirements"
    | "primarySkills"
    | "numberOfPositions"
    | "compensationRange"
  >;
  applyMode: ApplyMode;
  applyUrlSnapshot: string | null;
  includeCompensation: boolean;
  companyDisplayName: string | null;
}): PublicDistributionPayload {
  return {
    title: input.version.title,
    roleCategory: input.version.roleCategory,
    experienceRange: input.version.experienceRange,
    location: input.version.location,
    jobDescription: input.version.jobDescription,
    mustHaveRequirements: input.version.mustHaveRequirements,
    niceToHaveRequirements: input.version.niceToHaveRequirements,
    primarySkills: input.version.primarySkills,
    numberOfPositions: input.version.numberOfPositions,
    compensationRange: input.includeCompensation
      ? input.version.compensationRange
      : null,
    applyMode: input.applyMode,
    applyUrl: input.applyUrlSnapshot,
    companyDisplayName: input.companyDisplayName,
  };
}

export function assertPayloadHasNoInternalFields(
  payload: PublicDistributionPayload,
) {
  const record = payload as PublicDistributionPayload &
    Record<string, unknown>;
  return (
    !("evaluationCriteria" in record) &&
    !("targetHireDate" in record) &&
    !("structuredPayload" in record) &&
    !("aiProposedJobDescription" in record) &&
    !("companyId" in record) &&
    !("requirementLifecycle" in record)
  );
}

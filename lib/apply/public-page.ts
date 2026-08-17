import type { PublicDistributionPayload } from "@/lib/jobs/distribution/payload";

export type PublicHostedApplyPage = {
  title: string;
  roleCategory: PublicDistributionPayload["roleCategory"];
  experienceRange: string | null;
  location: string | null;
  jobDescription: string | null;
  mustHaveRequirements: string | null;
  niceToHaveRequirements: string | null;
  primarySkills: string | null;
  numberOfPositions: number | null;
  compensationRange: string | null;
  companyDisplayName: string | null;
};

export function toPublicHostedApplyPage(
  payload: PublicDistributionPayload,
): PublicHostedApplyPage {
  return {
    title: payload.title,
    roleCategory: payload.roleCategory,
    experienceRange: payload.experienceRange,
    location: payload.location,
    jobDescription: payload.jobDescription,
    mustHaveRequirements: payload.mustHaveRequirements,
    niceToHaveRequirements: payload.niceToHaveRequirements,
    primarySkills: payload.primarySkills,
    numberOfPositions: payload.numberOfPositions,
    compensationRange: payload.compensationRange,
    companyDisplayName: payload.companyDisplayName,
  };
}

export function assertHostedApplyPageHasNoInternalFields(
  page: PublicHostedApplyPage,
) {
  const record = page as PublicHostedApplyPage & Record<string, unknown>;
  return (
    !("evaluationCriteria" in record) &&
    !("targetHireDate" in record) &&
    !("structuredPayload" in record) &&
    !("aiProposedJobDescription" in record) &&
    !("companyId" in record) &&
    !("jobId" in record) &&
    !("distributionId" in record) &&
    !("specificationVersionId" in record) &&
    !("applyMode" in record) &&
    !("applyUrl" in record) &&
    !("requirementLifecycle" in record)
  );
}

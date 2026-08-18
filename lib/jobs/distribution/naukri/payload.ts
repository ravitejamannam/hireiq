import { ApplyMode } from "@prisma/client";

import type { PublicDistributionPayload } from "@/lib/jobs/distribution/payload";

/**
 * Intended Amplify-facing mapping of the public distribution DTO.
 *
 * This is NOT a live-certified Zwayam Amplify JSON schema. Exact field names,
 * taxonomy IDs, numeric salary units, industry codes, company IDs, screening
 * questions, and posting-credit fields are UNKNOWN without partner access.
 *
 * ASSUMPTION — HIREIQ_HOSTED / EXTERNAL_URL apply URLs may be accepted as an
 * external apply URL. The actual Amplify partner contract must confirm this.
 * ASSUMPTION — CREATE is asynchronous (UNKNOWN until FETCH). Do not treat
 * create success as LIVE.
 */
export type NaukriLiveRequiredGap =
  | "locationTaxonomy"
  | "experienceTaxonomy"
  | "numericSalary"
  | "roleFunctionTaxonomy"
  | "industry"
  | "companyApproval"
  | "postingCredits"
  | "screeningRequirements"
  | "amplifyJsonSchema";

export type NaukriMappedPayload = {
  title: string;
  description: string | null;
  companyDisplayName: string | null;
  location: {
    raw: string | null;
  };
  experience: {
    raw: string | null;
  };
  compensation: {
    raw: string | null;
  };
  applyMode: ApplyMode;
  applyUrl: string | null;
  liveRequiredGaps: NaukriLiveRequiredGap[];
  assumptions: {
    hostedExternalApplyUrlAccepted: "UNVERIFIED";
    createReturnsLiveStatus: false;
    pauseMapsToUnpublish: false;
    resumeMapsToRepost: false;
    nativeApplyContract: "UNKNOWN";
  };
};

export const NAUKRI_LIVE_REQUIRED_GAPS: NaukriLiveRequiredGap[] = [
  "locationTaxonomy",
  "experienceTaxonomy",
  "numericSalary",
  "roleFunctionTaxonomy",
  "industry",
  "companyApproval",
  "postingCredits",
  "screeningRequirements",
  "amplifyJsonSchema",
];

export function mapPublicPayloadToNaukri(
  payload: PublicDistributionPayload,
): NaukriMappedPayload {
  const native = payload.applyMode === ApplyMode.PROVIDER_NATIVE;

  return {
    title: payload.title,
    description: payload.jobDescription,
    companyDisplayName: payload.companyDisplayName,
    location: {
      raw: payload.location,
    },
    experience: {
      raw: payload.experienceRange,
    },
    compensation: {
      raw: payload.compensationRange,
    },
    applyMode: payload.applyMode,
    applyUrl: native ? null : payload.applyUrl,
    liveRequiredGaps: [...NAUKRI_LIVE_REQUIRED_GAPS],
    assumptions: {
      hostedExternalApplyUrlAccepted: "UNVERIFIED",
      createReturnsLiveStatus: false,
      pauseMapsToUnpublish: false,
      resumeMapsToRepost: false,
      nativeApplyContract: "UNKNOWN",
    },
  };
}

export function assertNaukriMappedPayloadHasNoInternalFields(
  mapped: NaukriMappedPayload,
) {
  const record = mapped as NaukriMappedPayload & Record<string, unknown>;
  return (
    !("evaluationCriteria" in record) &&
    !("targetHireDate" in record) &&
    !("structuredPayload" in record) &&
    !("aiProposedJobDescription" in record) &&
    !("companyId" in record) &&
    !("jobId" in record) &&
    !("requirementLifecycle" in record) &&
    !("naukriApply" in record) &&
    !("postUrl" in record) &&
    !("apiToken" in record)
  );
}

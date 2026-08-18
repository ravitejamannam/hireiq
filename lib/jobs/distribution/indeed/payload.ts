import { ApplyMode } from "@prisma/client";

import type { PublicDistributionPayload } from "@/lib/jobs/distribution/payload";

/**
 * HireIQ ATS identity sent to Indeed as metadata.jobPostingId.
 * Not Indeed sourcedPostingId. Do not store this on ProviderPosting.externalPostingId.
 */
export function hireiqJobPostingId(distributionId: number) {
  return `hireiq-dist-${distributionId}`;
}

export function parseHireiqJobPostingId(value: string) {
  const match = /^hireiq-dist-(\d+)$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Stable Indeed sourceName. Do not use Company.name — renames would mint a new listing.
 */
export function hireiqIndeedSourceName(companyId: number) {
  return `hireiq-company-${companyId}`;
}

export type IndeedLiveRequiredGap =
  | "contactEmail"
  | "contactPhone"
  | "isoCountry";

/**
 * Indeed Job Sync–shaped mapping of the public distribution DTO.
 * Not sent on the network in T87. Production IndeedProvider is fail-closed.
 *
 * ASSUMPTION — sourceType "Employer" requires partner confirmation.
 * ASSUMPTION — omitting indeedApply for HIREIQ_HOSTED / EXTERNAL_URL means
 * click-through to metadata.url; requires partner confirmation.
 */
export type IndeedMappedPayload = {
  body: {
    title: string;
    description: string | null;
    location: {
      raw: string | null;
      country: null;
    };
  };
  metadata: {
    jobPostingId: string;
    sourceName: string;
    companyName: string | null;
    url: string | null;
    sourceType: "Employer";
  };
  compensationRange: string | null;
  applyMode: ApplyMode;
  indeedApply: {
    postUrl: string | null;
    apiToken: null;
  } | null;
  liveRequiredGaps: IndeedLiveRequiredGap[];
};

export type IndeedMapperIdentity = {
  distributionId: number;
  companyId: number;
};

export function mapPublicPayloadToIndeed(
  payload: PublicDistributionPayload,
  identity: IndeedMapperIdentity,
): IndeedMappedPayload {
  const native = payload.applyMode === ApplyMode.PROVIDER_NATIVE;
  const liveRequiredGaps: IndeedLiveRequiredGap[] = [
    "contactEmail",
    "contactPhone",
    "isoCountry",
  ];

  return {
    body: {
      title: payload.title,
      description: payload.jobDescription,
      location: {
        raw: payload.location,
        country: null,
      },
    },
    metadata: {
      jobPostingId: hireiqJobPostingId(identity.distributionId),
      sourceName: hireiqIndeedSourceName(identity.companyId),
      companyName: payload.companyDisplayName,
      url: native ? null : payload.applyUrl,
      sourceType: "Employer",
    },
    compensationRange: payload.compensationRange,
    applyMode: payload.applyMode,
    indeedApply: native
      ? {
          postUrl: "/api/webhooks/indeed",
          apiToken: null,
        }
      : null,
    liveRequiredGaps,
  };
}

export function assertIndeedMappedPayloadHasNoInternalFields(
  mapped: IndeedMappedPayload,
) {
  const record = mapped as IndeedMappedPayload & Record<string, unknown>;
  return (
    !("evaluationCriteria" in record) &&
    !("targetHireDate" in record) &&
    !("structuredPayload" in record) &&
    !("aiProposedJobDescription" in record) &&
    !("companyId" in record) &&
    !("jobId" in record) &&
    !("requirementLifecycle" in record) &&
    !("contactEmail" in record) &&
    !("contactPhone" in record)
  );
}

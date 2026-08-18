import type { ApplicationIngestionChannel } from "@prisma/client";

/**
 * Provider-neutral ingestion input for T86+.
 * companyId/jobId/spec version MUST be derived server-side, never from a browser.
 */
export type NormalizedApplicationIngestion = {
  sourceChannel: ApplicationIngestionChannel;
  companyId: number;
  jobId: number;
  jobSpecificationVersionId: number;
  distributionId: number | null;
  providerPostingId: number | null;
  hostedApplySubmissionId: number | null;
  externalApplicationId: string | null;
  externalCandidateId: string | null;
  applicant: {
    name: string;
    emailNormalized: string | null;
    phone: string | null;
    location: string | null;
    experienceYears: number | null;
    linkedInUrl: string | null;
  };
};

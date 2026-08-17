import type { DistributionProvider, ProviderPostingStatus } from "@prisma/client";

import type { PublicDistributionPayload } from "@/lib/jobs/distribution/payload";

export type ProviderCapabilities = {
  create: boolean;
  update: boolean;
  close: boolean;
  pause: boolean;
  resume: boolean;
  fetchPosting: boolean;
  nativeApply: boolean;
  externalApply: boolean;
  webhookApplicantDelivery: boolean;
  pollApplicantDelivery: boolean;
};

export type ProviderConnectionView = {
  id: number;
  companyId: number;
  provider: DistributionProvider;
  status: string;
  providerAccountId: string | null;
  hasCredential: boolean;
};

export type AdapterSuccess = {
  ok: true;
  externalPostingId: string | null;
  externalUrl: string | null;
  providerStatus: ProviderPostingStatus;
};

export type AdapterFailure = {
  ok: false;
  retryable: boolean;
  code: string;
  message: string;
};

export type AdapterResult = AdapterSuccess | AdapterFailure;

export type PublishAdapterInput = {
  payload: PublicDistributionPayload;
  idempotencyKey: string;
  distributionId: number;
  connection: ProviderConnectionView | null;
};

export interface JobDistributionProviderAdapter {
  readonly provider: DistributionProvider;
  capabilities(): ProviderCapabilities;
  validateConnection(connection: ProviderConnectionView): AdapterResult;
  previewPayload(payload: PublicDistributionPayload): AdapterResult;
  publish(input: PublishAdapterInput): Promise<AdapterResult>;
  update(input: PublishAdapterInput): Promise<AdapterResult>;
  close(input: PublishAdapterInput): Promise<AdapterResult>;
  pause(input: PublishAdapterInput): Promise<AdapterResult>;
  resume(input: PublishAdapterInput): Promise<AdapterResult>;
  fetchPosting(input: {
    externalPostingId: string;
    connection: ProviderConnectionView | null;
  }): Promise<AdapterResult>;
}

export const PROVIDER_UNAVAILABLE_CODE = "PROVIDER_UNAVAILABLE";
export const UNSUPPORTED_OPERATION_CODE = "UNSUPPORTED_OPERATION";

export function unsupportedResult(operation: string): AdapterFailure {
  return {
    ok: false,
    retryable: false,
    code: UNSUPPORTED_OPERATION_CODE,
    message: `${operation} is not supported for this provider.`,
  };
}

export function unavailableResult(): AdapterFailure {
  return {
    ok: false,
    retryable: false,
    code: PROVIDER_UNAVAILABLE_CODE,
    message: "This provider is not available.",
  };
}

export const NO_CAPABILITIES: ProviderCapabilities = {
  create: false,
  update: false,
  close: false,
  pause: false,
  resume: false,
  fetchPosting: false,
  nativeApply: false,
  externalApply: false,
  webhookApplicantDelivery: false,
  pollApplicantDelivery: false,
};

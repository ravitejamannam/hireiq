import { DistributionProvider, ProviderPostingStatus } from "@prisma/client";

import {
  unsupportedResult,
  type AdapterResult,
  type JobDistributionProviderAdapter,
  type ProviderCapabilities,
  type ProviderConnectionView,
  type PublishAdapterInput,
} from "@/lib/jobs/distribution/adapter";
import type { PublicDistributionPayload } from "@/lib/jobs/distribution/payload";

/**
 * Human-recorded distribution. No network. Does not fabricate external IDs.
 */
export class ManualProvider implements JobDistributionProviderAdapter {
  readonly provider = DistributionProvider.MANUAL;

  capabilities(): ProviderCapabilities {
    return {
      create: true,
      update: true,
      close: true,
      pause: true,
      resume: true,
      fetchPosting: false,
      nativeApply: false,
      externalApply: true,
      webhookApplicantDelivery: false,
      pollApplicantDelivery: false,
    };
  }

  validateConnection(connection: ProviderConnectionView): AdapterResult {
    void connection;
    return {
      ok: true,
      externalPostingId: null,
      externalUrl: null,
      providerStatus: ProviderPostingStatus.UNKNOWN,
    };
  }

  previewPayload(payload: PublicDistributionPayload): AdapterResult {
    if (!payload.title.trim()) {
      return {
        ok: false,
        retryable: false,
        code: "INVALID_PAYLOAD",
        message: "A title is required to distribute this job.",
      };
    }

    return {
      ok: true,
      externalPostingId: null,
      externalUrl: payload.applyUrl,
      providerStatus: ProviderPostingStatus.UNKNOWN,
    };
  }

  async publish(input: PublishAdapterInput): Promise<AdapterResult> {
    const preview = this.previewPayload(input.payload);
    if (!preview.ok) {
      return preview;
    }

    return {
      ok: true,
      externalPostingId: null,
      externalUrl: input.payload.applyUrl,
      providerStatus: ProviderPostingStatus.UNKNOWN,
    };
  }

  async update(input: PublishAdapterInput): Promise<AdapterResult> {
    return this.publish(input);
  }

  async close(input: PublishAdapterInput): Promise<AdapterResult> {
    return {
      ok: true,
      externalPostingId: null,
      externalUrl: input.payload.applyUrl,
      providerStatus: ProviderPostingStatus.CLOSED,
    };
  }

  async pause(input: PublishAdapterInput): Promise<AdapterResult> {
    return {
      ok: true,
      externalPostingId: null,
      externalUrl: input.payload.applyUrl,
      providerStatus: ProviderPostingStatus.PAUSED,
    };
  }

  async resume(input: PublishAdapterInput): Promise<AdapterResult> {
    return {
      ok: true,
      externalPostingId: null,
      externalUrl: input.payload.applyUrl,
      providerStatus: ProviderPostingStatus.UNKNOWN,
    };
  }

  async fetchPosting(): Promise<AdapterResult> {
    return unsupportedResult("fetchPosting");
  }
}

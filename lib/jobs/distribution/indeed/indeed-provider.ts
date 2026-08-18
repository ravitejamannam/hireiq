import { DistributionProvider } from "@prisma/client";

import {
  type AdapterResult,
  type JobDistributionProviderAdapter,
  type ProviderCapabilities,
  type ProviderConnectionView,
  type PublishAdapterInput,
} from "@/lib/jobs/distribution/adapter";
import {
  indeedUnavailableResult,
  indeedUnsupportedOperation,
} from "@/lib/jobs/distribution/indeed/errors";
import { mapPublicPayloadToIndeed } from "@/lib/jobs/distribution/indeed/payload";
import type { PublicDistributionPayload } from "@/lib/jobs/distribution/payload";

/**
 * Production Indeed adapter.
 *
 * Indeed Job Sync / Indeed Apply are partner-gated. HireIQ does not call
 * Indeed, scrape Indeed, or fabricate sourcedPostingId values.
 * LIVE_INDEED_PROVIDER_NOT_TESTED.
 *
 * T83 has no hostedApply capability flag. HIREIQ_HOSTED is represented by
 * externalApply + T84 ApplyToken, not a new adapter field.
 */
export class IndeedProvider implements JobDistributionProviderAdapter {
  readonly provider = DistributionProvider.INDEED;

  capabilities(): ProviderCapabilities {
    return {
      create: true,
      update: true,
      close: true,
      pause: false,
      resume: false,
      fetchPosting: true,
      nativeApply: true,
      externalApply: true,
      webhookApplicantDelivery: true,
      pollApplicantDelivery: false,
    };
  }

  validateConnection(connection: ProviderConnectionView): AdapterResult {
    void connection;
    return indeedUnavailableResult();
  }

  previewPayload(payload: PublicDistributionPayload): AdapterResult {
    const mapped = mapPublicPayloadToIndeed(payload, {
      distributionId: 0,
      companyId: 0,
    });
    if (!mapped.body.title.trim()) {
      return {
        ok: false,
        retryable: false,
        code: "INVALID_PAYLOAD",
        message: "A title is required to distribute this job.",
      };
    }

    return indeedUnavailableResult();
  }

  async publish(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return indeedUnavailableResult();
  }

  async update(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return indeedUnavailableResult();
  }

  async close(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return indeedUnavailableResult();
  }

  async pause(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return indeedUnsupportedOperation("pause");
  }

  async resume(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return indeedUnsupportedOperation("resume");
  }

  async fetchPosting(input: {
    externalPostingId: string;
    connection: ProviderConnectionView | null;
  }): Promise<AdapterResult> {
    void input;
    return indeedUnavailableResult();
  }
}

export function isLiveIndeedPartnerConfigured() {
  return false;
}

export const INDEED_CAPABILITIES_NOTE =
  "Capabilities describe the intended Indeed Job Sync / Apply contract. Production publish is partner-gated and does not fabricate results. Pause/resume are unsupported.";

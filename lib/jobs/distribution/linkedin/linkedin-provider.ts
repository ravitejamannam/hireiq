import { DistributionProvider } from "@prisma/client";

import {
  type AdapterResult,
  type JobDistributionProviderAdapter,
  type ProviderCapabilities,
  type ProviderConnectionView,
  type PublishAdapterInput,
} from "@/lib/jobs/distribution/adapter";
import { linkedInUnavailableResult } from "@/lib/jobs/distribution/linkedin/errors";
import { mapPublicPayloadToLinkedIn } from "@/lib/jobs/distribution/linkedin/payload";
import type { PublicDistributionPayload } from "@/lib/jobs/distribution/payload";

/**
 * Production LinkedIn adapter.
 *
 * LinkedIn Job Posting / Apply Connect is partner-gated. HireIQ does not
 * call LinkedIn, scrape LinkedIn, or fabricate external posting IDs.
 * LIVE_LINKEDIN_PROVIDER_NOT_TESTED.
 */
export class LinkedInProvider implements JobDistributionProviderAdapter {
  readonly provider = DistributionProvider.LINKEDIN;

  capabilities(): ProviderCapabilities {
    return {
      create: true,
      update: true,
      close: true,
      pause: true,
      resume: true,
      fetchPosting: true,
      nativeApply: true,
      externalApply: true,
      webhookApplicantDelivery: true,
      pollApplicantDelivery: false,
    };
  }

  validateConnection(connection: ProviderConnectionView): AdapterResult {
    void connection;
    return linkedInUnavailableResult();
  }

  previewPayload(payload: PublicDistributionPayload): AdapterResult {
    const mapped = mapPublicPayloadToLinkedIn(payload);
    if (!mapped.title.trim()) {
      return {
        ok: false,
        retryable: false,
        code: "INVALID_PAYLOAD",
        message: "A title is required to distribute this job.",
      };
    }

    return linkedInUnavailableResult();
  }

  async publish(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return linkedInUnavailableResult();
  }

  async update(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return linkedInUnavailableResult();
  }

  async close(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return linkedInUnavailableResult();
  }

  async pause(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return linkedInUnavailableResult();
  }

  async resume(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return linkedInUnavailableResult();
  }

  async fetchPosting(input: {
    externalPostingId: string;
    connection: ProviderConnectionView | null;
  }): Promise<AdapterResult> {
    void input;
    return linkedInUnavailableResult();
  }
}

export function isLiveLinkedInPartnerConfigured() {
  return false;
}

export const LINKEDIN_CAPABILITIES_NOTE =
  "Capabilities describe the intended LinkedIn contract. Production publish is partner-gated and does not fabricate results.";

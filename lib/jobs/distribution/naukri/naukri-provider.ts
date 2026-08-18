import { DistributionProvider } from "@prisma/client";

import {
  type AdapterResult,
  type JobDistributionProviderAdapter,
  type ProviderCapabilities,
  type ProviderConnectionView,
  type PublishAdapterInput,
} from "@/lib/jobs/distribution/adapter";
import {
  naukriUnavailableResult,
  naukriUnsupportedOperation,
} from "@/lib/jobs/distribution/naukri/errors";
import { mapPublicPayloadToNaukri } from "@/lib/jobs/distribution/naukri/payload";
import type { PublicDistributionPayload } from "@/lib/jobs/distribution/payload";

/**
 * Production Naukri / Zwayam Amplify adapter.
 *
 * Amplify is partner-gated. HireIQ does not call Naukri, call Zwayam, scrape
 * Naukri, invent Amplify posting IDs, or implement an inbound webhook.
 * LIVE_NAUKRI_PROVIDER_NOT_TESTED.
 *
 * Capabilities describe the intended Amplify seam, not live API access.
 * T83 has no hostedApply capability flag. HIREIQ_HOSTED is represented by
 * externalApply + T84 ApplyToken. nativeApply is false because the Naukri
 * Apply contract is UNKNOWN.
 */
export class NaukriProvider implements JobDistributionProviderAdapter {
  readonly provider = DistributionProvider.NAUKRI;

  capabilities(): ProviderCapabilities {
    return {
      create: true,
      update: true,
      close: true,
      pause: false,
      resume: false,
      fetchPosting: true,
      nativeApply: false,
      externalApply: true,
      webhookApplicantDelivery: false,
      pollApplicantDelivery: true,
    };
  }

  validateConnection(connection: ProviderConnectionView): AdapterResult {
    void connection;
    return naukriUnavailableResult();
  }

  previewPayload(payload: PublicDistributionPayload): AdapterResult {
    const mapped = mapPublicPayloadToNaukri(payload);
    if (!mapped.title.trim()) {
      return {
        ok: false,
        retryable: false,
        code: "INVALID_PAYLOAD",
        message: "A title is required to distribute this job.",
      };
    }

    return naukriUnavailableResult();
  }

  async publish(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return naukriUnavailableResult();
  }

  async update(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return naukriUnavailableResult();
  }

  async close(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return naukriUnavailableResult();
  }

  async pause(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return naukriUnsupportedOperation("pause");
  }

  async resume(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return naukriUnsupportedOperation("resume");
  }

  async fetchPosting(input: {
    externalPostingId: string;
    connection: ProviderConnectionView | null;
  }): Promise<AdapterResult> {
    void input;
    return naukriUnavailableResult();
  }
}

export function isLiveNaukriPartnerConfigured() {
  return false;
}

export const NAUKRI_CAPABILITIES_NOTE =
  "Capabilities describe the intended Zwayam Amplify contract. Production publish is partner-gated and does not fabricate results. Pause/resume are unsupported. Native apply is UNKNOWN. Applicant delivery is poll-shaped, not a verified webhook.";

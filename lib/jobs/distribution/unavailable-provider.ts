import type { DistributionProvider } from "@prisma/client";

import {
  NO_CAPABILITIES,
  unavailableResult,
  unsupportedResult,
  type AdapterResult,
  type JobDistributionProviderAdapter,
  type ProviderCapabilities,
  type ProviderConnectionView,
  type PublishAdapterInput,
} from "@/lib/jobs/distribution/adapter";
import type { PublicDistributionPayload } from "@/lib/jobs/distribution/payload";

/**
 * Unused in T86–T88 production registry. LinkedIn, Indeed, and Naukri each
 * register a fail-closed adapter (no live API, no fabricated posting IDs)
 * without partner access. Keep this class for a future unconfigured provider.
 */
export class UnavailableProvider implements JobDistributionProviderAdapter {
  constructor(readonly provider: DistributionProvider) {}

  capabilities(): ProviderCapabilities {
    return { ...NO_CAPABILITIES, externalApply: true };
  }

  validateConnection(connection: ProviderConnectionView): AdapterResult {
    void connection;
    return unavailableResult();
  }

  previewPayload(payload: PublicDistributionPayload): AdapterResult {
    void payload;
    return unavailableResult();
  }

  async publish(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return unavailableResult();
  }

  async update(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return unavailableResult();
  }

  async close(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return unavailableResult();
  }

  async pause(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return unavailableResult();
  }

  async resume(input: PublishAdapterInput): Promise<AdapterResult> {
    void input;
    return unavailableResult();
  }

  async fetchPosting(): Promise<AdapterResult> {
    return unsupportedResult("fetchPosting");
  }
}

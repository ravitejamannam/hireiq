import {
  ApplyMode,
  DistributionProvider,
  ProviderPostingStatus,
} from "@prisma/client";

import {
  type AdapterResult,
  type JobDistributionProviderAdapter,
  type ProviderCapabilities,
  type ProviderConnectionView,
  type PublishAdapterInput,
} from "@/lib/jobs/distribution/adapter";
import {
  normalizeLinkedInHttpFailure,
  unknownCreateResult,
} from "@/lib/jobs/distribution/linkedin/errors";
import { mapPublicPayloadToLinkedIn } from "@/lib/jobs/distribution/linkedin/payload";
import type { PublicDistributionPayload } from "@/lib/jobs/distribution/payload";

export type FakeLinkedInScenario =
  | "SUCCESS"
  | "ASYNC_PENDING"
  | "REJECTED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "TIMEOUT"
  | "UNKNOWN_CREATE_RESULT"
  | "DUPLICATE_EXTERNAL_ID";

type StoredPosting = {
  externalPostingId: string;
  externalUrl: string | null;
  providerStatus: ProviderPostingStatus;
  applyUrl: string | null;
  createCount: number;
};

/**
 * Deterministic LinkedIn adapter for tests only.
 * Never registered in production. Fake IDs are prefixed `li-test-`.
 */
export class FakeLinkedInProvider implements JobDistributionProviderAdapter {
  readonly provider = DistributionProvider.LINKEDIN;

  private scenario: FakeLinkedInScenario = "SUCCESS";
  private readonly postings = new Map<number, StoredPosting>();
  private readonly byExternalId = new Map<string, StoredPosting>();
  private duplicateId = "li-test-duplicate";

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

  setScenario(scenario: FakeLinkedInScenario) {
    this.scenario = scenario;
  }

  setDuplicateExternalId(id: string) {
    this.duplicateId = id;
  }

  promote(distributionId: number, status: ProviderPostingStatus) {
    const row = this.postings.get(distributionId);
    if (!row) {
      return;
    }
    row.providerStatus = status;
  }

  getPosting(distributionId: number) {
    return this.postings.get(distributionId) ?? null;
  }

  seedPosting(input: {
    distributionId: number;
    externalPostingId: string;
    providerStatus?: ProviderPostingStatus;
  }) {
    const row: StoredPosting = {
      externalPostingId: input.externalPostingId,
      externalUrl: `https://www.linkedin.test/jobs/${input.externalPostingId}`,
      providerStatus: input.providerStatus ?? ProviderPostingStatus.UNKNOWN,
      applyUrl: null,
      createCount: 1,
    };
    this.postings.set(input.distributionId, row);
    this.byExternalId.set(input.externalPostingId, row);
  }

  validateConnection(connection: ProviderConnectionView): AdapterResult {
    if (!connection.hasCredential || connection.status !== "ACTIVE") {
      return normalizeLinkedInHttpFailure(401);
    }
    return {
      ok: true,
      externalPostingId: null,
      externalUrl: null,
      providerStatus: ProviderPostingStatus.UNKNOWN,
    };
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
    return {
      ok: true,
      externalPostingId: null,
      externalUrl: mapped.applyUrl,
      providerStatus: ProviderPostingStatus.UNKNOWN,
    };
  }

  async publish(input: PublishAdapterInput): Promise<AdapterResult> {
    const failure = this.failureForScenario();
    if (failure) {
      if (this.scenario === "UNKNOWN_CREATE_RESULT" || this.scenario === "TIMEOUT") {
        const existing = this.postings.get(input.distributionId);
        if (existing) {
          existing.createCount += 1;
          return this.successFrom(existing, input.payload.applyMode);
        }
        const stored = this.remember(input, ProviderPostingStatus.UNKNOWN);
        void stored;
        return unknownCreateResult();
      }
      return failure;
    }

    const existing = this.postings.get(input.distributionId);
    if (existing) {
      existing.createCount += 1;
      return this.successFrom(existing, input.payload.applyMode);
    }

    if (this.scenario === "DUPLICATE_EXTERNAL_ID") {
      return {
        ok: true,
        externalPostingId: this.duplicateId,
        externalUrl: `https://www.linkedin.test/jobs/${this.duplicateId}`,
        providerStatus: ProviderPostingStatus.LIVE,
      };
    }

    const status =
      this.scenario === "ASYNC_PENDING"
        ? ProviderPostingStatus.UNKNOWN
        : ProviderPostingStatus.LIVE;
    const stored = this.remember(input, status);
    return this.successFrom(stored, input.payload.applyMode);
  }

  async update(input: PublishAdapterInput): Promise<AdapterResult> {
    const existing = this.postings.get(input.distributionId);
    if (!existing) {
      return this.publish(input);
    }
    existing.applyUrl =
      input.payload.applyMode === ApplyMode.PROVIDER_NATIVE
        ? null
        : input.payload.applyUrl;
    return this.successFrom(existing, input.payload.applyMode);
  }

  async close(input: PublishAdapterInput): Promise<AdapterResult> {
    const existing = this.postings.get(input.distributionId);
    if (!existing) {
      return {
        ok: true,
        externalPostingId: null,
        externalUrl: input.payload.applyUrl,
        providerStatus: ProviderPostingStatus.CLOSED,
      };
    }
    existing.providerStatus = ProviderPostingStatus.CLOSED;
    return this.successFrom(existing, input.payload.applyMode);
  }

  async pause(input: PublishAdapterInput): Promise<AdapterResult> {
    const existing = this.postings.get(input.distributionId);
    if (!existing) {
      return {
        ok: true,
        externalPostingId: null,
        externalUrl: input.payload.applyUrl,
        providerStatus: ProviderPostingStatus.PAUSED,
      };
    }
    existing.providerStatus = ProviderPostingStatus.PAUSED;
    return this.successFrom(existing, input.payload.applyMode);
  }

  async resume(input: PublishAdapterInput): Promise<AdapterResult> {
    const existing = this.postings.get(input.distributionId);
    if (!existing) {
      return this.publish(input);
    }
    existing.providerStatus = ProviderPostingStatus.LIVE;
    return this.successFrom(existing, input.payload.applyMode);
  }

  async fetchPosting(input: {
    externalPostingId: string;
    connection: ProviderConnectionView | null;
  }): Promise<AdapterResult> {
    void input.connection;
    const row = this.byExternalId.get(input.externalPostingId);
    if (!row) {
      return {
        ok: false,
        retryable: true,
        code: "PROVIDER_UNAVAILABLE",
        message: "LinkedIn posting was not found for reconciliation.",
      };
    }
    return {
      ok: true,
      externalPostingId: row.externalPostingId,
      externalUrl: row.externalUrl,
      providerStatus: row.providerStatus,
    };
  }

  private remember(
    input: PublishAdapterInput,
    status: ProviderPostingStatus,
  ): StoredPosting {
    const externalPostingId = `li-test-${input.distributionId}`;
    const row: StoredPosting = {
      externalPostingId,
      externalUrl: `https://www.linkedin.test/jobs/${externalPostingId}`,
      providerStatus: status,
      applyUrl:
        input.payload.applyMode === ApplyMode.PROVIDER_NATIVE
          ? null
          : input.payload.applyUrl,
      createCount: 1,
    };
    this.postings.set(input.distributionId, row);
    this.byExternalId.set(externalPostingId, row);
    return row;
  }

  private successFrom(
    row: StoredPosting,
    applyMode: ApplyMode,
  ): AdapterResult {
    return {
      ok: true,
      externalPostingId: row.externalPostingId,
      externalUrl:
        applyMode === ApplyMode.PROVIDER_NATIVE ? row.externalUrl : row.applyUrl,
      providerStatus: row.providerStatus,
    };
  }

  private failureForScenario(): AdapterResult | null {
    if (this.scenario === "UNAUTHORIZED") {
      return normalizeLinkedInHttpFailure(401);
    }
    if (this.scenario === "FORBIDDEN") {
      return normalizeLinkedInHttpFailure(403);
    }
    if (this.scenario === "RATE_LIMITED") {
      return normalizeLinkedInHttpFailure(429);
    }
    if (this.scenario === "SERVER_ERROR") {
      return normalizeLinkedInHttpFailure(503);
    }
    if (this.scenario === "REJECTED") {
      return normalizeLinkedInHttpFailure(400);
    }
    if (this.scenario === "TIMEOUT" || this.scenario === "UNKNOWN_CREATE_RESULT") {
      return unknownCreateResult();
    }
    return null;
  }
}

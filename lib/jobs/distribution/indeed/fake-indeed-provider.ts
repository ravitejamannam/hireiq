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
  indeedUnsupportedOperation,
  normalizeIndeedHttpFailure,
  unknownCreateResult,
} from "@/lib/jobs/distribution/indeed/errors";
import { mapPublicPayloadToIndeed } from "@/lib/jobs/distribution/indeed/payload";
import type { PublicDistributionPayload } from "@/lib/jobs/distribution/payload";

export type FakeIndeedScenario =
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
 * Deterministic Indeed adapter for tests only.
 * Never registered in production. Fake sourcedPostingId values are prefixed `indeed-test-`.
 */
export class FakeIndeedProvider implements JobDistributionProviderAdapter {
  readonly provider = DistributionProvider.INDEED;

  private scenario: FakeIndeedScenario = "SUCCESS";
  private readonly postings = new Map<number, StoredPosting>();
  private readonly byExternalId = new Map<string, StoredPosting>();
  private duplicateId = "indeed-test-duplicate";

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

  setScenario(scenario: FakeIndeedScenario) {
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
      externalUrl: `https://www.indeed.test/viewjob?jk=${input.externalPostingId}`,
      providerStatus: input.providerStatus ?? ProviderPostingStatus.UNKNOWN,
      applyUrl: null,
      createCount: 1,
    };
    this.postings.set(input.distributionId, row);
    this.byExternalId.set(input.externalPostingId, row);
  }

  validateConnection(connection: ProviderConnectionView): AdapterResult {
    if (!connection.hasCredential || connection.status !== "ACTIVE") {
      return normalizeIndeedHttpFailure(401);
    }
    return {
      ok: true,
      externalPostingId: null,
      externalUrl: null,
      providerStatus: ProviderPostingStatus.UNKNOWN,
    };
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
    return {
      ok: true,
      externalPostingId: null,
      externalUrl: mapped.metadata.url,
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
        externalUrl: `https://www.indeed.test/viewjob?jk=${this.duplicateId}`,
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
    void input.connection;
    const row = this.byExternalId.get(input.externalPostingId);
    if (!row) {
      return {
        ok: false,
        retryable: true,
        code: "PROVIDER_UNAVAILABLE",
        message: "Indeed posting was not found for reconciliation.",
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
    const externalPostingId = `indeed-test-${input.distributionId}`;
    const row: StoredPosting = {
      externalPostingId,
      externalUrl: `https://www.indeed.test/viewjob?jk=${externalPostingId}`,
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
      return normalizeIndeedHttpFailure(401);
    }
    if (this.scenario === "FORBIDDEN") {
      return normalizeIndeedHttpFailure(403);
    }
    if (this.scenario === "RATE_LIMITED") {
      return normalizeIndeedHttpFailure(429);
    }
    if (this.scenario === "SERVER_ERROR") {
      return normalizeIndeedHttpFailure(503);
    }
    if (this.scenario === "REJECTED") {
      return normalizeIndeedHttpFailure(400);
    }
    if (this.scenario === "TIMEOUT" || this.scenario === "UNKNOWN_CREATE_RESULT") {
      return unknownCreateResult();
    }
    return null;
  }
}

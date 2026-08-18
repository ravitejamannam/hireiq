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
  naukriUnsupportedOperation,
  normalizeNaukriHttpFailure,
  unknownCreateResult,
} from "@/lib/jobs/distribution/naukri/errors";
import { mapPublicPayloadToNaukri } from "@/lib/jobs/distribution/naukri/payload";
import type { PublicDistributionPayload } from "@/lib/jobs/distribution/payload";

export type FakeNaukriScenario =
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
 * Deterministic Naukri adapter for tests only.
 * Never registered in production. Fake Amplify ids are prefixed `naukri-test-`.
 * Do not copy Indeed's hireiq-dist-{distributionId} ATS identity.
 */
export class FakeNaukriProvider implements JobDistributionProviderAdapter {
  readonly provider = DistributionProvider.NAUKRI;

  private scenario: FakeNaukriScenario = "SUCCESS";
  private readonly postings = new Map<number, StoredPosting>();
  private readonly byExternalId = new Map<string, StoredPosting>();
  private duplicateId = "naukri-test-duplicate";

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

  setScenario(scenario: FakeNaukriScenario) {
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
      externalUrl: `https://naukri.test/job/${input.externalPostingId}`,
      providerStatus: input.providerStatus ?? ProviderPostingStatus.UNKNOWN,
      applyUrl: null,
      createCount: 1,
    };
    this.postings.set(input.distributionId, row);
    this.byExternalId.set(input.externalPostingId, row);
  }

  validateConnection(connection: ProviderConnectionView): AdapterResult {
    if (!connection.hasCredential || connection.status !== "ACTIVE") {
      return normalizeNaukriHttpFailure(401);
    }
    return {
      ok: true,
      externalPostingId: null,
      externalUrl: null,
      providerStatus: ProviderPostingStatus.UNKNOWN,
    };
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
      if (
        this.scenario === "UNKNOWN_CREATE_RESULT" ||
        this.scenario === "TIMEOUT"
      ) {
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
        externalUrl: `https://naukri.test/job/${this.duplicateId}`,
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
    void input.connection;
    const row = this.byExternalId.get(input.externalPostingId);
    if (!row) {
      return {
        ok: false,
        retryable: true,
        code: "PROVIDER_UNAVAILABLE",
        message: "Naukri posting was not found for reconciliation.",
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
    const externalPostingId = `naukri-test-${input.distributionId}`;
    const row: StoredPosting = {
      externalPostingId,
      externalUrl: `https://naukri.test/job/${externalPostingId}`,
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
      return normalizeNaukriHttpFailure(401);
    }
    if (this.scenario === "FORBIDDEN") {
      return normalizeNaukriHttpFailure(403);
    }
    if (this.scenario === "RATE_LIMITED") {
      return normalizeNaukriHttpFailure(429);
    }
    if (this.scenario === "SERVER_ERROR") {
      return normalizeNaukriHttpFailure(503);
    }
    if (this.scenario === "REJECTED") {
      return normalizeNaukriHttpFailure(400);
    }
    if (
      this.scenario === "TIMEOUT" ||
      this.scenario === "UNKNOWN_CREATE_RESULT"
    ) {
      return unknownCreateResult();
    }
    return null;
  }
}

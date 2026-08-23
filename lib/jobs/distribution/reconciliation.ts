import {
  DistributionProvider,
  JobDistributionStatus,
  ProviderPostingStatus,
  ReconciliationOutcome,
  type Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/authorization";
import { getDistributionAdapter } from "@/lib/jobs/distribution/registry";

/**
 * Reconciliation sweep (T96 Phase 4).
 *
 * Purpose: detect drift between HireIQ's view of a PUBLISHED distribution
 * and what the board actually reports, so applicants stop flowing into
 * roles the board has already closed.
 *
 * Design contracts (constitution):
 * - DETECTION ONLY. This module never mutates distribution or posting
 *   state; auto-heal is a product decision requiring its own ticket.
 * - Deterministic evaluation via evaluatePostingState (pure, §7) — unit
 *   testable without any provider.
 * - Bounded work per sweep (batchSize cap) so an unbounded provider list
 *   can never wedge a request.
 * - No candidate data is read or written here.
 */

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

export type PostingStateVerdict = {
  outcome: ReconciliationOutcome;
  finding: string | null;
};

/**
 * Pure comparison of expected vs observed posting state.
 * Exported for unit testing without providers.
 */
export function evaluatePostingState(input: {
  adapterOk: boolean;
  retryable?: boolean;
  failureCode?: string | null;
  expectedStatus: ProviderPostingStatus | null;
  observedStatus: ProviderPostingStatus | null;
}): PostingStateVerdict {
  const { adapterOk, retryable, failureCode, expectedStatus, observedStatus } = input;

  if (!adapterOk) {
    if (retryable) {
      return { outcome: ReconciliationOutcome.ERROR, finding: failureCode ?? "PROVIDER_TRANSIENT" };
    }
    // Non-retryable lookup failure: the board no longer knows this posting.
    return {
      outcome: ReconciliationOutcome.DRIFT,
      finding: failureCode === "PROVIDER_UNAVAILABLE"
        ? "POSTING_MISSING_ON_PROVIDER"
        : failureCode ?? "PROVIDER_LOOKUP_FAILED",
    };
  }

  if (
    expectedStatus !== null &&
    observedStatus !== null &&
    expectedStatus !== observedStatus
  ) {
    return {
      outcome: ReconciliationOutcome.DRIFT,
      finding: `STATUS_MISMATCH: expected ${expectedStatus}, observed ${observedStatus}`,
    };
  }

  return { outcome: ReconciliationOutcome.OK, finding: null };
}

type SweepInput = { batchSize?: unknown };

export type ReconciliationBatchSummary = {
  batchId: string;
  checked: number;
  ok: number;
  drift: number;
  error: number;
  skipped: number;
};

export async function runReconciliationSweepForAdmin(
  input: SweepInput = {},
): Promise<ReconciliationBatchSummary> {
  await requireAdmin();
  return runReconciliationSweep(input);
}

/** Core sweep. Auth is enforced by callers (admin action / cron route). */
export async function runReconciliationSweep(
  input: SweepInput = {},
): Promise<ReconciliationBatchSummary> {
  const batchSize =
    typeof input.batchSize === "number" &&
    Number.isInteger(input.batchSize) &&
    input.batchSize > 0
      ? Math.min(input.batchSize, MAX_BATCH_SIZE)
      : DEFAULT_BATCH_SIZE;

  const batchId = randomUUID();

  const distributions = await prisma.jobDistribution.findMany({
    where: {
      status: JobDistributionStatus.PUBLISHED,
      pinnedSpecificationVersion: { status: "PUBLISHED" },
      job: { status: "OPEN" },
      posting: { externalPostingId: { not: null } },
    },
    select: {
      id: true,
      provider: true,
      posting: {
        select: { externalPostingId: true, providerStatus: true },
      },
    },
    orderBy: { id: "asc" },
    take: batchSize,
  });

  const rows: Prisma.DistributionReconciliationRunCreateManyInput[] = [];

  for (const distribution of distributions) {
    const adapter = getDistributionAdapter(distribution.provider);
    if (!adapter.capabilities().fetchPosting || !distribution.posting?.externalPostingId) {
      rows.push({
        batchId,
        distributionId: distribution.id,
        provider: distribution.provider,
        outcome: ReconciliationOutcome.SKIPPED,
        expectedStatus: distribution.posting?.providerStatus ?? null,
        observedStatus: null,
        finding: "ADAPTER_CANNOT_FETCH_POSTING",
      });
      continue;
    }

    let verdict: PostingStateVerdict;
    let observedStatus: ProviderPostingStatus | null = null;

    try {
      const result = await adapter.fetchPosting({
        externalPostingId: distribution.posting.externalPostingId,
        connection: null,
      });

      if (result.ok) {
        observedStatus = result.providerStatus as ProviderPostingStatus;
        verdict = evaluatePostingState({
          adapterOk: true,
          expectedStatus: distribution.posting.providerStatus,
          observedStatus,
        });
      } else {
        verdict = evaluatePostingState({
          adapterOk: false,
          retryable: result.retryable,
          failureCode: result.code,
          expectedStatus: distribution.posting.providerStatus,
          observedStatus: null,
        });
      }
    } catch (error) {
      verdict = evaluatePostingState({
        adapterOk: false,
        retryable: true,
        failureCode: error instanceof Error ? error.name : "ADAPTER_EXCEPTION",
        expectedStatus: distribution.posting.providerStatus,
        observedStatus: null,
      });
    }

    rows.push({
      batchId,
      distributionId: distribution.id,
      provider: distribution.provider,
      outcome: verdict.outcome,
      expectedStatus: distribution.posting.providerStatus,
      observedStatus,
      finding: verdict.finding,
    });
  }

  if (rows.length > 0) {
    await prisma.distributionReconciliationRun.createMany({ data: rows });
  }

  const summary: ReconciliationBatchSummary = {
    batchId,
    checked: rows.length,
    ok: rows.filter((r) => r.outcome === ReconciliationOutcome.OK).length,
    drift: rows.filter((r) => r.outcome === ReconciliationOutcome.DRIFT).length,
    error: rows.filter((r) => r.outcome === ReconciliationOutcome.ERROR).length,
    skipped: rows.filter((r) => r.outcome === ReconciliationOutcome.SKIPPED).length,
  };

  console.info("[reconciliation] sweep complete", {
    ...summary,
  });

  return summary;
}

export type ReconciliationHealth = {
  lastRunAt: Date | null;
  batchId: string | null;
  counts: { ok: number; drift: number; error: number; skipped: number };
  recentFindings: Array<{
    id: number;
    distributionId: number;
    provider: DistributionProvider;
    outcome: ReconciliationOutcome;
    finding: string | null;
    checkedAt: Date;
  }>;
};

export async function getLatestReconciliationHealth(): Promise<ReconciliationHealth> {
  await requireAdmin();

  const latest = await prisma.distributionReconciliationRun.findFirst({
    orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
    select: { batchId: true, checkedAt: true },
  });

  if (!latest) {
    return {
      lastRunAt: null,
      batchId: null,
      counts: { ok: 0, drift: 0, error: 0, skipped: 0 },
      recentFindings: [],
    };
  }

  const [grouped, findings] = await Promise.all([
    prisma.distributionReconciliationRun.groupBy({
      by: ["outcome"],
      where: { batchId: latest.batchId },
      _count: { _all: true },
    }),
    prisma.distributionReconciliationRun.findMany({
      where: {
        batchId: latest.batchId,
        outcome: { in: [ReconciliationOutcome.DRIFT, ReconciliationOutcome.ERROR] },
      },
      orderBy: { id: "desc" },
      take: 20,
      select: {
        id: true,
        distributionId: true,
        provider: true,
        outcome: true,
        finding: true,
        checkedAt: true,
      },
    }),
  ]);

  const counts = { ok: 0, drift: 0, error: 0, skipped: 0 };
  for (const group of grouped) {
    const key = group.outcome.toLowerCase() as keyof typeof counts;
    counts[key] += group._count._all;
  }

  return {
    lastRunAt: latest.checkedAt,
    batchId: latest.batchId,
    counts,
    recentFindings: findings,
  };
}

/** True when the given provider supports reconciliation checks. */
export function providerSupportsReconciliation(provider: DistributionProvider): boolean {
  return getDistributionAdapter(provider).capabilities().fetchPosting;
}

import type { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";
import { isProductionRuntime } from "@/lib/production/assert-env";
import { eraseCandidate, retryIncompleteErasures, type ErasureDeps } from "@/lib/privacy/candidate-erasure";
import {
  CATEGORIES_WITHOUT_EXPIRY_MECHANISM,
  cutoffFor,
  RetentionPolicyError,
  unconfiguredPolicyProvider,
  validateRule,
  type RetentionCategory,
  type RetentionPolicyProvider,
} from "@/lib/privacy/retention-policy";

/**
 * Scheduled retention expiry. DRY-RUN BY DEFAULT.
 *
 * - Acts only on categories where a customer rule exists (see retention-policy.ts). No rule, nothing eligible.
 * - Skips candidates with an open RetentionHold or a RETAINED deletion decision.
 * - Works one tenant at a time and every query carries that tenant's companyId.
 * - Execution reuses eraseCandidate, so it is idempotent, resumable, and tombstones the candidate so pending
 *   jobs cannot recreate the data. Re-running finds nothing left to do.
 * - Reports counts and category names only. No ids of people, no content.
 * - "execute" is refused when NODE_ENV is production. Turning it on for production is a separate, deliberate change.
 */

export class RetentionExecutionDisabledError extends Error {
  constructor() {
    super("Retention execution is disabled in production in this release. Run dry-run only.");
    this.name = "RetentionExecutionDisabledError";
  }
}

export type CategoryReport = {
  category: RetentionCategory;
  /** NO_POLICY: nothing is eligible. INVALID_POLICY: rule rejected. CONFIGURED: evaluated. */
  policy: "NO_POLICY" | "INVALID_POLICY" | "CONFIGURED";
  eligible: number;
  heldBack: number;
  /** Executed in this run. Always 0 in dry-run. */
  expired: number;
  failed: number;
};

export type CompanyReport = { companyId: number; categories: CategoryReport[]; incompleteErasures: number };

export type RetentionReport = {
  mode: "dry-run" | "execute";
  at: string;
  companies: CompanyReport[];
  totals: { eligible: number; heldBack: number; expired: number; failed: number; incompleteErasures: number };
  /** Inventory categories with no automatic expiry. Each needs a product or legal decision. */
  decisionRequired: readonly string[];
  retriedErasures?: { attempted: number; completed: number; stillPartial: number };
};

const CATEGORY_ORDER: RetentionCategory[] = ["CANDIDATE_PERSONAL_DATA", "OUTBOUND_EMAIL_CONTENT"];
const DEAD_RETRY_AT = new Date("2099-01-01T00:00:00.000Z");

function emptyReport(category: RetentionCategory, policy: CategoryReport["policy"]): CategoryReport {
  return { category, policy, eligible: 0, heldBack: 0, expired: 0, failed: 0 };
}

function candidateWhere(companyId: number, cutoff: Date, statuses: NonNullable<ReturnType<typeof validateRule>>["closedStatuses"]): Prisma.CandidateWhereInput {
  return {
    companyId,
    erasedAt: null,
    applications: { some: {}, every: { status: { in: statuses }, updatedAt: { lt: cutoff } } },
    deletionRequests: { none: { status: "RETAINED" } },
  };
}

async function runCandidates(input: {
  companyId: number;
  cutoff: Date;
  statuses: NonNullable<ReturnType<typeof validateRule>>["closedStatuses"];
  execute: boolean;
  batchSize: number;
  deps?: ErasureDeps;
  report: CategoryReport;
}) {
  const base = candidateWhere(input.companyId, input.cutoff, input.statuses);
  const held = { retentionHolds: { some: { releasedAt: null } } } satisfies Prisma.CandidateWhereInput;
  const free = { retentionHolds: { none: { releasedAt: null } } } satisfies Prisma.CandidateWhereInput;
  input.report.eligible = await prisma.candidate.count({ where: { ...base, ...free } });
  input.report.heldBack = await prisma.candidate.count({ where: { ...base, ...held } });
  if (!input.execute || input.report.eligible === 0) return;

  const batch = await prisma.candidate.findMany({
    where: { ...base, ...free },
    orderBy: { id: "asc" },
    take: input.batchSize,
    select: { id: true },
  });
  for (const row of batch) {
    try {
      // The hold is re-read right before erasing, so a hold placed after the batch was selected still wins.
      const heldNow = await prisma.retentionHold.count({ where: { companyId: input.companyId, candidateId: row.id, releasedAt: null } });
      if (heldNow > 0) {
        input.report.heldBack += 1;
        input.report.eligible -= 1;
        continue;
      }
      const result = await eraseCandidate({ companyId: input.companyId, candidateId: row.id, trigger: "RETENTION_POLICY", deps: input.deps });
      if (result.status === "COMPLETED") input.report.expired += 1;
      else input.report.failed += 1;
      // The worker is the actor, so no user id is recorded. The erasure above is already done and cannot be undone,
      // so a missing audit row is not hidden: it is logged and counted in `failed`, on top of `expired`.
      try {
        await writeAuditLog(prisma, {
          actorUserId: null,
          actorRole: "SYSTEM_RETENTION",
          companyId: input.companyId,
          action: "RETENTION_EXPIRED",
          targetType: "CANDIDATE",
          targetId: row.id,
          reason: `${result.status} failed=${result.failedSteps.length}`,
        });
      } catch (error) {
        console.error("[retention] audit row not written", { candidateId: row.id, error: error instanceof Error ? error.message : "unknown" });
        input.report.failed += 1;
      }
    } catch {
      input.report.failed += 1;
    }
  }
}

async function runEmails(input: { companyId: number; cutoff: Date; execute: boolean; batchSize: number; report: CategoryReport }) {
  const base: Prisma.OutboundEmailAttemptWhereInput = {
    companyId: input.companyId,
    createdAt: { lt: input.cutoff },
    NOT: { subject: "erased" },
  };
  const holds = await prisma.retentionHold.findMany({ where: { companyId: input.companyId, releasedAt: null }, select: { candidateId: true } });
  const heldIds = holds.map((row) => row.candidateId);
  const free: Prisma.OutboundEmailAttemptWhereInput = heldIds.length ? { OR: [{ candidateId: null }, { candidateId: { notIn: heldIds } }] } : {};
  input.report.eligible = await prisma.outboundEmailAttempt.count({ where: { ...base, ...free } });
  input.report.heldBack = heldIds.length ? await prisma.outboundEmailAttempt.count({ where: { ...base, candidateId: { in: heldIds } } }) : 0;
  if (!input.execute || input.report.eligible === 0) return;
  const rows = await prisma.outboundEmailAttempt.findMany({
    where: { ...base, ...free },
    orderBy: { id: "asc" },
    take: input.batchSize,
    select: { id: true, status: true },
  });
  try {
    const ids = rows.map((row) => row.id);
    // Content goes. Delivered mail keeps its SENT status. Anything not delivered is cancelled so it is never retried.
    await prisma.outboundEmailAttempt.updateMany({
      where: { id: { in: ids }, companyId: input.companyId },
      data: { to: "erased@erased.invalid", subject: "erased", text: "", html: "", lastError: null },
    });
    await prisma.outboundEmailAttempt.updateMany({
      where: { id: { in: ids }, companyId: input.companyId, status: { not: "SENT" } },
      data: { status: "CANCELLED", nextRetryAt: DEAD_RETRY_AT },
    });
    input.report.expired += rows.length;
  } catch {
    input.report.failed += rows.length;
  }
}

export async function runRetention(
  options: {
    now?: Date;
    mode?: "dry-run" | "execute";
    provider?: RetentionPolicyProvider;
    companyIds?: number[];
    batchSize?: number;
    deps?: ErasureDeps;
  } = {},
): Promise<RetentionReport> {
  const mode = options.mode ?? "dry-run";
  if (mode === "execute" && isProductionRuntime()) throw new RetentionExecutionDisabledError();
  const now = options.now ?? new Date();
  const provider = options.provider ?? unconfiguredPolicyProvider;
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 100, 500));
  const execute = mode === "execute";

  const allCompanies = await provider.listCompanyIds();
  const companyIds = options.companyIds ? allCompanies.filter((id) => options.companyIds!.includes(id)) : allCompanies;

  const companies: CompanyReport[] = [];
  for (const companyId of companyIds) {
    let rules: Awaited<ReturnType<RetentionPolicyProvider["rulesFor"]>> = {};
    try {
      rules = await provider.rulesFor(companyId);
    } catch {
      rules = {};
    }
    const categories: CategoryReport[] = [];
    for (const category of CATEGORY_ORDER) {
      let rule: ReturnType<typeof validateRule> = null;
      try {
        rule = validateRule(category, rules[category]);
      } catch (error) {
        if (!(error instanceof RetentionPolicyError)) throw error;
        categories.push(emptyReport(category, "INVALID_POLICY"));
        continue;
      }
      if (!rule) {
        categories.push(emptyReport(category, "NO_POLICY"));
        continue;
      }
      const report = emptyReport(category, "CONFIGURED");
      const cutoff = cutoffFor(now, rule.retainDays);
      try {
        if (category === "CANDIDATE_PERSONAL_DATA") {
          await runCandidates({ companyId, cutoff, statuses: rule.closedStatuses, execute, batchSize, deps: options.deps, report });
        } else {
          await runEmails({ companyId, cutoff, execute, batchSize, report });
        }
      } catch {
        report.failed += 1;
      }
      categories.push(report);
    }
    const incompleteErasures = await prisma.candidateErasure.count({ where: { companyId, status: { in: ["PENDING", "PARTIAL"] } } });
    companies.push({ companyId, categories, incompleteErasures });
  }

  const totals = { eligible: 0, heldBack: 0, expired: 0, failed: 0, incompleteErasures: 0 };
  for (const company of companies) {
    totals.incompleteErasures += company.incompleteErasures;
    for (const category of company.categories) {
      totals.eligible += category.eligible;
      totals.heldBack += category.heldBack;
      totals.expired += category.expired;
      totals.failed += category.failed;
    }
  }
  const retriedErasures = execute ? await retryIncompleteErasures({ deps: options.deps, companyIds }) : undefined;
  return {
    mode,
    at: now.toISOString(),
    companies,
    totals,
    decisionRequired: CATEGORIES_WITHOUT_EXPIRY_MECHANISM,
    ...(retriedErasures ? { retriedErasures } : {}),
  };
}

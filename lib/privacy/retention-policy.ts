import type { ApplicationPipelineStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Retention policy inputs. HireIQ ships NO default retention period.
 *
 * The 180-day and 1,460-day constants in retention.ts are talent-rediscovery windows. They are not legal
 * retention deadlines and are not used here. A period only exists when a provider returns a rule, and
 * every rule must name its basis (the contract clause, notice or statute the customer relies on), so the
 * decision is traceable to a person and not to a code constant.
 */

export type RetentionCategory = "CANDIDATE_PERSONAL_DATA" | "OUTBOUND_EMAIL_CONTENT";

export type RetentionRule = {
  /** Days after the anchor. Must be a positive integer. */
  retainDays: number;
  /** Where the period comes from, for example a customer contract clause or candidate-notice version. Required. */
  basis: string;
  /**
   * CANDIDATE_PERSONAL_DATA only. A candidate expires only when every application is in one of these statuses.
   * Required there, so open and hired applications are never expired by accident.
   */
  closedStatuses?: ApplicationPipelineStatus[];
};

export type RetentionRules = Partial<Record<RetentionCategory, RetentionRule>>;

export interface RetentionPolicyProvider {
  listCompanyIds(): Promise<number[]>;
  rulesFor(companyId: number): Promise<RetentionRules>;
}

/** Categories that are in the inventory but have no automatic expiry in this pass. Each needs a product or legal decision. */
export const CATEGORIES_WITHOUT_EXPIRY_MECHANISM = [
  "AI_RUN_METADATA",
  "ASSESSMENT_SCORES_AND_INTEGRITY",
  "INTERVIEW_EVALUATIONS",
  "AUDIT_LOG",
  "BACKUPS",
  "PROVIDER_COPIES",
] as const;

/** Default provider. Lists companies and returns no rules, so nothing is ever eligible. */
export const unconfiguredPolicyProvider: RetentionPolicyProvider = {
  async listCompanyIds() {
    const rows = await prisma.company.findMany({ select: { id: true }, orderBy: { id: "asc" } });
    return rows.map((row) => row.id);
  },
  async rulesFor() {
    return {};
  },
};

export class RetentionPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetentionPolicyError";
  }
}

/** Rejects a rule that is missing a basis or a usable period. A rejected rule is treated as no policy. */
export function validateRule(category: RetentionCategory, rule: RetentionRule | undefined): RetentionRule | null {
  if (!rule) return null;
  if (!Number.isInteger(rule.retainDays) || rule.retainDays <= 0) {
    throw new RetentionPolicyError(`${category}: retainDays must be a positive integer.`);
  }
  if (!rule.basis || rule.basis.trim().length < 5) {
    throw new RetentionPolicyError(`${category}: a documented basis is required.`);
  }
  if (category === "CANDIDATE_PERSONAL_DATA" && (!rule.closedStatuses || rule.closedStatuses.length === 0)) {
    throw new RetentionPolicyError(`${category}: closedStatuses is required.`);
  }
  return rule;
}

export function cutoffFor(now: Date, retainDays: number) {
  return new Date(now.getTime() - retainDays * 24 * 60 * 60 * 1000);
}

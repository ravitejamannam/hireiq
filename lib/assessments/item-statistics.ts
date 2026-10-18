/**
 * Item statistics for assessment questions.
 * Group labels are passed in by the caller. This file does not read self-identification.
 * DIF stays off until every compared group has at least MIN_DIF_GROUP responses.
 */

export const MIN_DIF_GROUP = 30;

export type ItemFlag = "too-easy" | "too-hard" | "weak-discrimination" | "negative-discrimination";

export type AuditEntry = {
  companyId: number;
  action: string;
  targetType: string;
  targetId: number;
  reason: string;
};

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function populationVariance(values: number[]) {
  if (values.length === 0) return 0;
  const center = mean(values);
  return values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length;
}

export function pValue(scores: number[]) {
  if (scores.length === 0) return null;
  return mean(scores.map((score) => (score > 0 ? 1 : 0)));
}

/** Corrected point-biserial: item score against the total of the other items. */
export function pointBiserial(item: number[], restTotal: number[]) {
  if (item.length !== restTotal.length || item.length < 3) return null;
  const binary = item.map((score) => (score > 0 ? 1 : 0));
  const p = mean(binary);
  const q = 1 - p;
  if (p === 0 || q === 0) return 0;
  const passed = restTotal.filter((_, index) => binary[index] === 1);
  const failed = restTotal.filter((_, index) => binary[index] === 0);
  const spread = Math.sqrt(populationVariance(restTotal));
  if (spread === 0) return 0;
  return ((mean(passed) - mean(failed)) / spread) * Math.sqrt(p * q);
}

export function cronbachAlpha(matrix: number[][]) {
  if (matrix.length < 2 || matrix[0]?.length < 2) return null;
  const items = matrix[0].length;
  const itemVars = Array.from({ length: items }, (_, item) => populationVariance(matrix.map((row) => row[item] ?? 0)));
  const totals = matrix.map((row) => row.reduce((sum, value) => sum + value, 0));
  const totalVar = populationVariance(totals);
  if (totalVar === 0) return null;
  return (items / (items - 1)) * (1 - itemVars.reduce((sum, value) => sum + value, 0) / totalVar);
}

export function itemFlags(input: { p: number | null; discrimination: number | null }): ItemFlag[] {
  const flags: ItemFlag[] = [];
  if (input.p != null && input.p > 0.95) flags.push("too-easy");
  if (input.p != null && input.p < 0.2) flags.push("too-hard");
  if (input.discrimination != null && input.discrimination < 0) flags.push("negative-discrimination");
  else if (input.discrimination != null && input.discrimination < 0.15) flags.push("weak-discrimination");
  return flags;
}

export function difCheck(input: { groupA: number[]; groupB: number[] }) {
  if (input.groupA.length < MIN_DIF_GROUP || input.groupB.length < MIN_DIF_GROUP) {
    return { status: "insufficient" as const, difference: null, minimum: MIN_DIF_GROUP };
  }
  const a = pValue(input.groupA) ?? 0;
  const b = pValue(input.groupB) ?? 0;
  const difference = Math.round((a - b) * 1000) / 1000;
  return {
    status: Math.abs(difference) >= 0.15 ? "flag" as const : "ok" as const,
    difference,
    minimum: MIN_DIF_GROUP,
  };
}

export function statisticsAudit(companyId: number, assessmentId: number, flagged: number): AuditEntry {
  return {
    companyId,
    action: "ASSESSMENT_ITEM_STATISTICS",
    targetType: "Assessment",
    targetId: assessmentId,
    reason: `${flagged} item flags. DIF uses the fairness sample-size rule and does not read self-identification here.`,
  };
}

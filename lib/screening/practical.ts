import { z } from "zod";

import type { RubricCriterion } from "@/lib/screening/screening-policy";

export type CriterionScoreRow = {
  id: number;
  criterionKey: string;
  points: number;
  maxPoints: number;
  source: "HUMAN" | "AI_SUGGESTED";
  createdAt: Date;
};

/** Latest row per criterion for one source. Older rows stay as history. */
export function latestByCriterion(rows: CriterionScoreRow[], source: CriterionScoreRow["source"]) {
  const latest = new Map<string, CriterionScoreRow>();
  for (const row of rows) {
    if (row.source !== source) continue;
    const current = latest.get(row.criterionKey);
    if (!current || row.createdAt > current.createdAt || (row.createdAt.getTime() === current.createdAt.getTime() && row.id > current.id)) {
      latest.set(row.criterionKey, row);
    }
  }
  return latest;
}

/**
 * Final practical score from the assignment's own rubric snapshot. Returns
 * null until every criterion has a human score. AI suggestions never count.
 */
export function finalPracticalScore(rubric: RubricCriterion[], rows: CriterionScoreRow[]) {
  if (rubric.length === 0) return null;
  const human = latestByCriterion(rows, "HUMAN");
  let points = 0;
  let maxPoints = 0;
  for (const criterion of rubric) {
    const row = human.get(criterion.key);
    if (!row || row.maxPoints !== criterion.maxPoints) return null;
    points += row.points;
    maxPoints += criterion.maxPoints;
  }
  return { points, maxPoints, percent: (points / maxPoints) * 100 };
}

export const practicalSubmissionSchema = z
  .object({
    text: z.string().trim().min(20, "Describe your work in at least 20 characters.").max(50_000),
    url: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((value) => (value ? value : null))
      .refine((value) => value === null || /^https:\/\/[^\s]+$/i.test(value), "Links must start with https://."),
  })
  .strict();

export function parsePracticalSubmission(value: unknown) {
  return practicalSubmissionSchema.safeParse(value);
}

export type PracticalState = "NOT_ASSIGNED" | "ASSIGNED" | "OVERDUE" | "PENDING_GRADING" | "GRADED";

export function practicalStateOf(input: {
  submittedAt: Date | null;
  gradedAt: Date | null;
  dueAt: Date | null;
  now: Date;
}): Exclude<PracticalState, "NOT_ASSIGNED"> {
  if (input.gradedAt) return "GRADED";
  if (input.submittedAt) return "PENDING_GRADING";
  if (input.dueAt && input.dueAt.getTime() <= input.now.getTime()) return "OVERDUE";
  return "ASSIGNED";
}

export function practicalAcceptsSubmission(input: { submittedAt: Date | null; dueAt: Date | null; now: Date }) {
  if (input.submittedAt) return false;
  return !input.dueAt || input.dueAt.getTime() > input.now.getTime();
}

/** AI suggestions are kept only when the quote is copied verbatim from the submission. */
export function acceptAiCriterionSuggestion(input: {
  submission: string;
  criterion: RubricCriterion;
  points: unknown;
  quote: unknown;
  rationale: unknown;
}) {
  if (typeof input.points !== "number" || !Number.isInteger(input.points)) return null;
  if (input.points < 0 || input.points > input.criterion.maxPoints) return null;
  if (typeof input.quote !== "string" || input.quote.trim().length < 8) return null;
  if (!input.submission.includes(input.quote)) return null;
  const rationale = typeof input.rationale === "string" ? input.rationale.trim().slice(0, 600) : "";
  return { points: input.points, quote: input.quote.slice(0, 400), rationale };
}

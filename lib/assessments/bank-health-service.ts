import { RoleCategory, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/authorization";

/**
 * Assessment bank health + leakage tracking (T102 Phase 10).
 *
 * HackerRank-style exposure control: every minted invite increments
 * timesUsed on included questions; admins see exposure distribution and
 * can retire over-exposed questions. Retired questions stay in the bank
 * for historical scoring reproducibility but are excluded from new
 * invites.
 */

export const EXPOSURE_HIGH_THRESHOLD = 5;

export type BankQuestionView = {
  id: number;
  roleCategory: string;
  sortOrder: number;
  promptPreview: string;
  active: boolean;
  timesUsed: number;
  exposure: "LOW" | "MEDIUM" | "HIGH";
};

export type BankHealth = {
  totals: { active: number; retired: number };
  byCategory: Array<{
    roleCategory: string;
    active: number;
    retired: number;
    maxTimesUsed: number;
  }>;
  questions: BankQuestionView[];
};

export async function getAssessmentBankHealthForAdmin(
  categoryFilter?: unknown,
): Promise<BankHealth> {
  await requireAdmin();

  const where: Prisma.AssessmentBankQuestionWhereInput = {};
  if (
    typeof categoryFilter === "string" &&
    Object.values(RoleCategory).includes(categoryFilter as RoleCategory)
  ) {
    where.roleCategory = categoryFilter as RoleCategory;
  }

  const [questions] = await Promise.all([
    prisma.assessmentBankQuestion.findMany({
      where,
      select: {
        id: true,
        roleCategory: true,
        sortOrder: true,
        prompt: true,
        active: true,
        timesUsed: true,
      },
      orderBy: [{ timesUsed: "desc" }, { roleCategory: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.assessmentBankQuestion.groupBy({
      by: ["roleCategory"],
      where,
      _count: { _all: true },
      _max: { timesUsed: true },
    }),
  ]);

  // Grouped counts of active vs retired need a second groupBy pass since
  // `active` is a boolean — aggregate in TS from the question list instead.
  const byCategoryMap = new Map<
    string,
    { roleCategory: string; active: number; retired: number; maxTimesUsed: number }
  >();
  for (const q of questions) {
    let entry = byCategoryMap.get(q.roleCategory);
    if (!entry) {
      entry = { roleCategory: q.roleCategory, active: 0, retired: 0, maxTimesUsed: 0 };
      byCategoryMap.set(q.roleCategory, entry);
    }
    if (q.active) entry.active += 1;
    else entry.retired += 1;
    entry.maxTimesUsed = Math.max(entry.maxTimesUsed, q.timesUsed);
  }

  return {
    totals: {
      active: questions.filter((q) => q.active).length,
      retired: questions.filter((q) => !q.active).length,
    },
    byCategory: [...byCategoryMap.values()].sort((a, b) =>
      a.roleCategory.localeCompare(b.roleCategory),
    ),
    questions: questions.map((q) => ({
      id: q.id,
      roleCategory: q.roleCategory,
      sortOrder: q.sortOrder,
      promptPreview: q.prompt.slice(0, 120),
      active: q.active,
      timesUsed: q.timesUsed,
      exposure:
        q.timesUsed >= EXPOSURE_HIGH_THRESHOLD
          ? "HIGH"
          : q.timesUsed >= Math.ceil(EXPOSURE_HIGH_THRESHOLD / 2)
            ? "MEDIUM"
            : "LOW",
    })),
  };
}

export async function setQuestionActiveForAdmin(input: {
  questionId: unknown;
  active: unknown;
}): Promise<{ id: number; active: boolean }> {
  await requireAdmin();

  const questionId = validateQuestionId(input.questionId);
  if (input.active !== true && input.active !== false) {
    throw new BankHealthError("ACTIVE_FLAG_INVALID");
  }

  const existing = await prisma.assessmentBankQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, active: true },
  });
  if (!existing) throw new BankHealthError("QUESTION_NOT_FOUND");

  const updated = await prisma.assessmentBankQuestion.update({
    where: { id: questionId },
    data: { active: input.active },
    select: { id: true, active: true },
  });

  return updated;
}

export class BankHealthError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function validateQuestionId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (parsed > 0) return parsed;
  }
  throw new BankHealthError("INVALID_QUESTION_ID");
}

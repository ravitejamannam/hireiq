import { Prisma, type RoleCategory } from "@prisma/client";

import {
  ASSESSMENT_BANK_EMPTY,
  ASSESSMENT_UNAVAILABLE,
  AssessmentError,
} from "@/lib/assessments/assessment-errors";
import { selectAdaptiveMix } from "@/lib/assessments/assessment-math";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

const QUESTION_SELECT = {
  id: true,
  prompt: true,
  choices: true,
  correctIndex: true,
  weight: true,
  difficulty: true,
} as const;

export type SnapshotQuestion = {
  id: number;
  prompt: string;
  choices: Prisma.JsonValue;
  correctIndex: number;
  weight: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
};

/**
 * Draw the adaptive mix from the live bank. Increment timesUsed only when
 * this draw is the freeze-at-publish (or a legacy mint with no pin).
 */
export async function selectAssessmentQuestionsForCategory(
  roleCategory: RoleCategory,
  db: Db,
  options: { incrementUsage?: boolean } = {},
): Promise<SnapshotQuestion[]> {
  const questions = await db.assessmentBankQuestion.findMany({
    where: { roleCategory, active: true },
    orderBy: [{ timesUsed: "asc" }, { sortOrder: "asc" }],
    select: QUESTION_SELECT,
  });

  if (questions.length === 0) {
    throw new AssessmentError(ASSESSMENT_BANK_EMPTY, "UNAVAILABLE");
  }

  const selected = selectAdaptiveMix(questions);

  if (options.incrementUsage && selected.length > 0) {
    await db.assessmentBankQuestion.updateMany({
      where: { id: { in: selected.map((question) => question.id) } },
      data: { timesUsed: { increment: 1 } },
    });
  }

  return selected;
}

export async function snapshotAssessmentQuestionIds(
  roleCategory: RoleCategory,
  db: Db,
): Promise<number[]> {
  const selected = await selectAssessmentQuestionsForCategory(roleCategory, db, {
    incrementUsage: true,
  });
  return selected.map((question) => question.id);
}

/** Load a frozen pin. Inactive/deleted questions fail closed — do not silently drop. */
export async function loadAssessmentQuestionsByIds(
  ids: number[],
  db: Db,
): Promise<SnapshotQuestion[]> {
  if (ids.length === 0) {
    throw new AssessmentError(ASSESSMENT_UNAVAILABLE, "UNAVAILABLE");
  }

  const questions = await db.assessmentBankQuestion.findMany({
    where: { id: { in: ids } },
    select: QUESTION_SELECT,
  });
  const byId = new Map(questions.map((question) => [question.id, question]));
  const ordered: SnapshotQuestion[] = [];

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      throw new AssessmentError(ASSESSMENT_UNAVAILABLE, "UNAVAILABLE");
    }
    ordered.push(row);
  }

  return ordered;
}

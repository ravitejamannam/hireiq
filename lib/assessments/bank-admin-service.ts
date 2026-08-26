import { QuestionDifficulty, RoleCategory } from "@prisma/client";

import { requireAdmin, AuthorizationError } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

/**
 * T134 question-bank admin (unlocks adaptive assessments).
 *
 * Admins manage the live bank: create questions per role category with
 * difficulty tiers, retire/reactivate items, adjust weights. Retired
 * questions keep scoring historical attempts (constitution §6) — there
 * is no hard delete.
 */

export type BankQuestionView = {
  id: number;
  roleCategory: RoleCategory;
  sortOrder: number;
  prompt: string;
  choices: string[];
  correctIndex: number;
  weight: number;
  skillTag: string | null;
  difficulty: QuestionDifficulty;
  active: boolean;
  timesUsed: number;
};

const MAX_PROMPT = 600;
const MAX_CHOICES = 6;

function fail(error: string) {
  return { ok: false as const, error };
}

export async function listBankQuestions(): Promise<
  { ok: true; questions: BankQuestionView[] } | { ok: false; error: string }
> {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthorizationError) return fail("Admin access required.");
    throw error;
  }

  const rows = await prisma.assessmentBankQuestion.findMany({
    orderBy: [{ roleCategory: "asc" }, { sortOrder: "asc" }],
  });

  return {
    ok: true,
    questions: rows.map((r) => ({
      id: r.id,
      roleCategory: r.roleCategory,
      sortOrder: r.sortOrder,
      prompt: r.prompt,
      choices: Array.isArray(r.choices) ? (r.choices as string[]) : [],
      correctIndex: r.correctIndex,
      weight: r.weight,
      skillTag: r.skillTag,
      difficulty: r.difficulty,
      active: r.active,
      timesUsed: r.timesUsed,
    })),
  };
}

export type CreateQuestionInput = {
  roleCategory: RoleCategory;
  prompt: string;
  choices: string[];
  correctIndex: number;
  weight?: number;
  skillTag?: string;
  difficulty?: QuestionDifficulty;
};

export async function createBankQuestion(
  input: CreateQuestionInput,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthorizationError) return fail("Admin access required.");
    throw error;
  }

  const prompt = input.prompt?.trim();
  if (!prompt || prompt.length < 8 || prompt.length > MAX_PROMPT) {
    return fail(`Prompt must be 8–${MAX_PROMPT} characters.`);
  }

  const choices = (input.choices ?? []).map((c) => c.trim()).filter(Boolean);
  if (choices.length < 3 || choices.length > MAX_CHOICES) {
    return fail(`Provide 3–${MAX_CHOICES} answer choices.`);
  }

  if (!Number.isInteger(input.correctIndex) || input.correctIndex < 0 || input.correctIndex >= choices.length) {
    return fail("Correct answer index is out of range.");
  }

  const weight = input.weight ?? 1;
  if (!Number.isInteger(weight) || weight < 1 || weight > 10) {
    return fail("Weight must be 1–10.");
  }

  // Append after the highest existing sortOrder in this category.
  const last = await prisma.assessmentBankQuestion.findFirst({
    where: { roleCategory: input.roleCategory },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  try {
    const created = await prisma.assessmentBankQuestion.create({
      data: {
        roleCategory: input.roleCategory,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        prompt,
        choices,
        correctIndex: input.correctIndex,
        weight,
        skillTag: input.skillTag?.trim() || null,
        difficulty: input.difficulty ?? "MEDIUM",
      },
      select: { id: true },
    });
    return { ok: true, id: created.id };
  } catch (error) {
    console.error("[bank-question] create failed", error);
    return fail("Could not create the question.");
  }
}

export async function setBankQuestionActive(
  id: number,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthorizationError) return fail("Admin access required.");
    throw error;
  }

  await prisma.assessmentBankQuestion.update({ where: { id }, data: { active } });
  return { ok: true };
}

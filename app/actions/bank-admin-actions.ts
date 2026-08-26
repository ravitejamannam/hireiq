"use server";

import { revalidatePath } from "next/cache";

import {
  createBankQuestion,
  setBankQuestionActive,
} from "@/lib/assessments/bank-admin-service";

export async function createBankQuestionAction(input: {
  roleCategory: import("@prisma/client").RoleCategory;
  prompt: string;
  choices: string[];
  correctIndex: number;
  weight?: number;
  skillTag?: string;
  difficulty?: import("@prisma/client").QuestionDifficulty;
}) {
  const result = await createBankQuestion(input);
  if (result.ok) revalidatePath("/dashboard/assessment-bank");
  return result;
}

export async function setBankQuestionActiveAction(id: number, active: boolean) {
  const result = await setBankQuestionActive(id, active);
  if (result.ok) revalidatePath("/dashboard/assessment-bank");
  return result;
}

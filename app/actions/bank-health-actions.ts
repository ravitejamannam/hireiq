"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError } from "@/lib/auth/authorization";
import {
  getAssessmentBankHealthForAdmin,
  BankHealthError,
} from "@/lib/assessments/bank-health-service";

export async function getAssessmentBankHealth(categoryFilter?: unknown) {
  await requireAdminCompat();
  return getAssessmentBankHealthForAdmin(categoryFilter);
}

export async function retireAssessmentQuestion(questionId: unknown) {
  try {
    const result = await setQuestionActive(questionId, false);
    revalidatePath("/dashboard/assessment-bank");
    return { ok: true as const, question: result };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    return { ok: false as const, error: bankErrorMessage(error) };
  }
}

export async function reactivateAssessmentQuestion(questionId: unknown) {
  try {
    const result = await setQuestionActive(questionId, true);
    revalidatePath("/dashboard/assessment-bank");
    return { ok: true as const, question: result };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    return { ok: false as const, error: bankErrorMessage(error) };
  }
}

async function setQuestionActive(questionId: unknown, active: boolean) {
  const service = await import("@/lib/assessments/bank-health-service");
  return service.setQuestionActiveForAdmin({ questionId, active });
}

async function requireAdminCompat() {
  const { requireAdmin } = await import("@/lib/auth/authorization");
  return requireAdmin();
}

function bankErrorMessage(error: unknown): string {
  if (error instanceof BankHealthError) {
    switch (error.code) {
      case "QUESTION_NOT_FOUND":
        return "Question not found.";
      case "ACTIVE_FLAG_INVALID":
        return "Invalid state change.";
      default:
        return error.message;
    }
  }
  return "Bank action failed. Please try again.";
}

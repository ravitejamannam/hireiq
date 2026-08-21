import { AssessmentAttemptStatus } from "@prisma/client";

import { AssessmentValidationError } from "@/lib/assessments/assessment-errors";

const TOKEN_MAX = 128;

export function validatePublicAssessmentToken(token: unknown) {
  if (typeof token !== "string" || !token.trim() || token.length > TOKEN_MAX) {
    return null;
  }

  return token.trim();
}

export function validateAssessmentAnswers(
  questionIds: number[],
  answers: unknown,
) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw new AssessmentValidationError({
      form: "Answers are required.",
    });
  }

  const record = answers as Record<string, unknown>;
  const selected: Record<number, number> = {};

  for (const questionId of questionIds) {
    const raw = record[String(questionId)];
    const parsed =
      typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new AssessmentValidationError({
        form: "Answer every question before submitting.",
      });
    }
    selected[questionId] = parsed;
  }

  return selected;
}

export function isTerminalAttemptStatus(status: AssessmentAttemptStatus) {
  return (
    status === AssessmentAttemptStatus.COMPLETED ||
    status === AssessmentAttemptStatus.EXPIRED
  );
}

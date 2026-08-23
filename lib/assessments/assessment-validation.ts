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

/**
 * T101: client-self-reported integrity telemetry. Counts are capped and
 * must be non-negative integers; anything malformed is treated as absent —
 * a broken client should not fail an otherwise valid submission, and the
 * absence of telemetry is honest "no data", not fabricated zeros.
 */
export type IntegritySignals = {
  tabSwitches: number;
  pastes: number;
  copies: number;
};

const INTEGRITY_COUNT_MAX = 999;

function sanitizeIntegrityCount(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return Math.min(parsed, INTEGRITY_COUNT_MAX);
}

export function validateIntegritySignals(value: unknown): IntegritySignals | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  // All keys present but all zero/absent → treat as no signals.
  const signals: IntegritySignals = {
    tabSwitches: sanitizeIntegrityCount(record.tabSwitches),
    pastes: sanitizeIntegrityCount(record.pastes),
    copies: sanitizeIntegrityCount(record.copies),
  };

  if (
    signals.tabSwitches === 0 &&
    signals.pastes === 0 &&
    signals.copies === 0
  ) {
    return null;
  }
  return signals;
}

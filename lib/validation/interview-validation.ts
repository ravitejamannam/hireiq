import { InterviewResult, InterviewType } from "@prisma/client";

export class InterviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterviewValidationError";
  }
}

export function validateInterviewId(id: unknown) {
  return validatePositiveInteger(id, "Interview ID must be a positive integer.");
}

export function validateInterviewInput(
  type: unknown,
  interviewAt: unknown,
  result: unknown,
) {
  return {
    type: validateInterviewType(type),
    interviewAt: validateInterviewAt(interviewAt),
    result: validateInterviewResult(result),
  };
}

function validateInterviewType(type: unknown) {
  if (
    typeof type !== "string" ||
    !Object.values(InterviewType).includes(type as InterviewType)
  ) {
    throw new InterviewValidationError("Interview type is invalid.");
  }

  return type as InterviewType;
}

function validateInterviewResult(result: unknown) {
  if (
    typeof result !== "string" ||
    !Object.values(InterviewResult).includes(result as InterviewResult)
  ) {
    throw new InterviewValidationError("Interview result is invalid.");
  }

  return result as InterviewResult;
}

function validateInterviewAt(value: unknown) {
  const date = parseDate(value);
  if (!date) {
    throw new InterviewValidationError(
      "Interview date and time are required.",
    );
  }

  return date;
}

function validatePositiveInteger(value: unknown, message: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new InterviewValidationError(message);
  }

  return value;
}

function parseDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

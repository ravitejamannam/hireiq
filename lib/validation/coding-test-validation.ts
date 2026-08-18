import { CodingTestStatus } from "@prisma/client";

export class CodingTestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodingTestValidationError";
  }
}

const TITLE_MAX_LENGTH = 200;

export function validateCodingTestId(id: unknown) {
  return validatePositiveInteger(
    id,
    "Coding test ID must be a positive integer.",
  );
}

export function validateCodingTestInput(
  title: unknown,
  score: unknown,
  maxScore: unknown,
  status: unknown,
  takenAt: unknown,
) {
  const validatedTitle = validateTitle(title);
  const validatedScore = validateNonNegativeInteger(score, "Score");
  const validatedMaxScore = validatePositiveInteger(
    maxScore,
    "Maximum score must be a positive integer.",
  );

  if (validatedScore > validatedMaxScore) {
    throw new CodingTestValidationError(
      "Score cannot be greater than maximum score.",
    );
  }

  return {
    title: validatedTitle,
    score: validatedScore,
    maxScore: validatedMaxScore,
    status: validateCodingTestStatus(status),
    takenAt: validateTakenAt(takenAt),
  };
}

function validateTitle(title: unknown) {
  if (typeof title !== "string" || !title.trim()) {
    throw new CodingTestValidationError("Test title is required.");
  }

  const trimmed = title.trim();
  if (trimmed.length > TITLE_MAX_LENGTH) {
    throw new CodingTestValidationError(
      `Test title must be ${TITLE_MAX_LENGTH} characters or fewer.`,
    );
  }

  return trimmed;
}

function validateCodingTestStatus(status: unknown) {
  if (
    typeof status !== "string" ||
    !Object.values(CodingTestStatus).includes(status as CodingTestStatus)
  ) {
    throw new CodingTestValidationError("Coding test status is invalid.");
  }

  return status as CodingTestStatus;
}

function validateTakenAt(value: unknown) {
  const date = parseDate(value);
  if (!date) {
    throw new CodingTestValidationError("Taken date and time are required.");
  }

  return date;
}

function validateNonNegativeInteger(value: unknown, label: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new CodingTestValidationError(`${label} must be 0 or greater.`);
  }

  return value;
}

function validatePositiveInteger(value: unknown, message: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new CodingTestValidationError(message);
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

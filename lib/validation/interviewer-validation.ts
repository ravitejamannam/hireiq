import {
  InterviewerAvailability,
  InterviewerCategory,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class InterviewerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterviewerValidationError";
  }
}

export function validateInterviewerId(id: unknown) {
  if (
    typeof id !== "number" ||
    !Number.isFinite(id) ||
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new InterviewerValidationError(
      "Interviewer ID must be a positive integer.",
    );
  }

  return id;
}

export function validateNullableInterviewerId(id: unknown) {
  if (id === null) {
    return null;
  }

  return validateInterviewerId(id);
}

function validateName(name: unknown) {
  if (typeof name !== "string" || !name.trim()) {
    throw new InterviewerValidationError("Interviewer name is required.");
  }

  return name.trim();
}

function validateCategory(category: unknown) {
  if (
    typeof category !== "string" ||
    !Object.values(InterviewerCategory).includes(category as InterviewerCategory)
  ) {
    throw new InterviewerValidationError("Interviewer category is invalid.");
  }

  return category as InterviewerCategory;
}

function validateAvailability(availability: unknown) {
  if (
    typeof availability !== "string" ||
    !Object.values(InterviewerAvailability).includes(
      availability as InterviewerAvailability,
    )
  ) {
    throw new InterviewerValidationError("Interviewer availability is invalid.");
  }

  return availability as InterviewerAvailability;
}

export function validateInterviewerInput(
  name: unknown,
  category: unknown,
  availability: unknown,
) {
  return {
    name: validateName(name),
    category: validateCategory(category),
    availability: validateAvailability(availability),
  };
}

export async function ensureInterviewerExists(id: number) {
  const interviewer = await prisma.interviewer.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (!interviewer) {
    throw new InterviewerValidationError("Interviewer not found.");
  }

  return interviewer;
}

import { RoleCategory } from "@prisma/client";

import { JobValidationError } from "@/lib/validation/job-validation";

export class JobSpecificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobSpecificationError";
  }
}

export const SPECIFICATION_STALE_ERROR =
  "Specification was updated in another session. Reload and try again.";

export const SPECIFICATION_POSTED_ERROR =
  "Specification cannot be edited after the requirement is posted.";

export const SPECIFICATION_PUBLISHED_IMMUTABLE_ERROR =
  "Published specifications cannot be changed.";

export type JobSpecificationCompletionFields = {
  title: unknown;
  roleCategory: unknown;
  experienceRange: unknown;
  location: unknown;
  compensationRange: unknown;
  targetHireDate: unknown;
  numberOfPositions: unknown;
  mustHaveRequirements: unknown;
  niceToHaveRequirements: unknown;
  jobDescription: unknown;
  evaluationCriteria: unknown;
  primarySkills: unknown;
};

function validateRequiredString(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new JobValidationError(message);
  }

  return value.trim();
}

function validatePositiveInteger(value: unknown, message: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new JobValidationError(message);
  }

  return value;
}

/**
 * Completeness rules for requirement completion. Messages must stay identical
 * to the pre-T81 Job validator. Lifecycle/timestamp rules stay in job-validation.
 */
export function validateJobRequirementCompletion(
  fields: JobSpecificationCompletionFields,
) {
  validateRequiredString(fields.title, "Title is required.");

  if (
    fields.roleCategory === null ||
    fields.roleCategory === undefined ||
    fields.roleCategory === ""
  ) {
    throw new JobValidationError("Role category is required.");
  }

  if (
    typeof fields.roleCategory !== "string" ||
    !Object.values(RoleCategory).includes(fields.roleCategory as RoleCategory)
  ) {
    throw new JobValidationError("Role category is required.");
  }

  validateRequiredString(
    fields.experienceRange,
    "Experience range is required.",
  );
  validateRequiredString(fields.location, "Location is required.");
  validateRequiredString(
    fields.compensationRange,
    "Compensation range is required.",
  );

  if (
    !(fields.targetHireDate instanceof Date) ||
    Number.isNaN(fields.targetHireDate.getTime())
  ) {
    throw new JobValidationError("Target hire date is required.");
  }

  if (
    fields.numberOfPositions === null ||
    fields.numberOfPositions === undefined
  ) {
    throw new JobValidationError("Number of positions is required.");
  }

  validatePositiveInteger(
    fields.numberOfPositions,
    "Number of positions is required.",
  );

  validateRequiredString(
    fields.mustHaveRequirements,
    "Must-have requirements are required.",
  );
  validateRequiredString(
    fields.niceToHaveRequirements,
    "Nice-to-have requirements are required.",
  );
  validateRequiredString(fields.jobDescription, "Job description is required.");
  validateRequiredString(
    fields.evaluationCriteria,
    "Evaluation criteria are required.",
  );
  validateRequiredString(fields.primarySkills, "Primary skills are required.");

  return {
    title: String(fields.title).trim(),
    roleCategory: fields.roleCategory as RoleCategory,
    experienceRange: String(fields.experienceRange).trim(),
    location: String(fields.location).trim(),
    compensationRange: String(fields.compensationRange).trim(),
    targetHireDate: fields.targetHireDate,
    numberOfPositions: fields.numberOfPositions as number,
    mustHaveRequirements: String(fields.mustHaveRequirements).trim(),
    niceToHaveRequirements: String(fields.niceToHaveRequirements).trim(),
    jobDescription: String(fields.jobDescription).trim(),
    evaluationCriteria: String(fields.evaluationCriteria).trim(),
    primarySkills: String(fields.primarySkills).trim(),
  };
}

export function assertSpecificationEditableForLifecycle(lifecycle: string) {
  if (
    lifecycle === "REQUIREMENT_POSTED" ||
    lifecycle === "INTERVIEWER_NOTIFIED" ||
    lifecycle === "SOURCING_SHORTLISTING" ||
    lifecycle === "BILLING_GENERATED"
  ) {
    throw new JobSpecificationError(SPECIFICATION_POSTED_ERROR);
  }
}

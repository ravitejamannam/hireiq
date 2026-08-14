import {
  JobStatus,
  RequirementLifecycle,
  RoleCategory,
  SourcingDatabaseSource,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class JobValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobValidationError";
  }
}

export type JobRequirementInput = {
  roleCategory?: unknown;
  experienceRange?: unknown;
  location?: unknown;
  compensationRange?: unknown;
  targetHireDate?: unknown;
  numberOfPositions?: unknown;
  mustHaveRequirements?: unknown;
  niceToHaveRequirements?: unknown;
  jobDescription?: unknown;
  evaluationCriteria?: unknown;
  primarySkills?: unknown;
  requirementLifecycle?: unknown;
  clientCompletedAt?: unknown;
  sourcingDatabaseSource?: unknown;
  sourcingAccessDetails?: unknown;
  sourcingAccessReceivedAt?: unknown;
  shortlistingDueAt?: unknown;
  shortlistingCompletedAt?: unknown;
};

type JobRequirementData = {
  roleCategory?: RoleCategory | null;
  experienceRange?: string | null;
  location?: string | null;
  compensationRange?: string | null;
  targetHireDate?: Date | null;
  numberOfPositions?: number | null;
  mustHaveRequirements?: string | null;
  niceToHaveRequirements?: string | null;
  jobDescription?: string | null;
  evaluationCriteria?: string | null;
  primarySkills?: string | null;
  requirementLifecycle?: RequirementLifecycle;
  clientCompletedAt?: Date | null;
  sourcingDatabaseSource?: SourcingDatabaseSource | null;
  sourcingAccessDetails?: string | null;
  sourcingAccessReceivedAt?: Date | null;
  shortlistingDueAt?: Date | null;
  shortlistingCompletedAt?: Date | null;
};

type ValidateRequirementFieldsOptions = {
  allowRequirementLifecycle?: boolean;
  requireDraftLifecycle?: boolean;
};

const allowedRequirementLifecycleTransitions: Partial<
  Record<RequirementLifecycle, RequirementLifecycle>
> = {
  REQUIREMENT_DRAFTED: "CLIENT_NOTIFIED",
  CLIENT_NOTIFIED: "REQUIREMENT_POSTED",
  REQUIREMENT_POSTED: "INTERVIEWER_NOTIFIED",
  INTERVIEWER_NOTIFIED: "SOURCING_SHORTLISTING",
};

export function validateJobId(id: unknown) {
  if (
    typeof id !== "number" ||
    !Number.isFinite(id) ||
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new JobValidationError("Job ID must be a positive integer.");
  }

  return id;
}

function validateRequiredString(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new JobValidationError(message);
  }

  return value.trim();
}

function validateOptionalString(value: unknown, message: string) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new JobValidationError(message);
  }

  return value.trim() || null;
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

function validateOptionalDate(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new JobValidationError("Requirement date/time is invalid.");
  }

  return value;
}

function validateJobStatus(status: unknown) {
  if (
    typeof status !== "string" ||
    !Object.values(JobStatus).includes(status as JobStatus)
  ) {
    throw new JobValidationError("Job status is invalid.");
  }

  return status as JobStatus;
}

function validateRoleCategory(roleCategory: unknown) {
  if (roleCategory === null || roleCategory === undefined) {
    return null;
  }

  if (
    typeof roleCategory !== "string" ||
    !Object.values(RoleCategory).includes(roleCategory as RoleCategory)
  ) {
    throw new JobValidationError("Role category is invalid.");
  }

  return roleCategory as RoleCategory;
}

export function validateRequirementLifecycleValue(requirementLifecycle: unknown) {
  if (
    typeof requirementLifecycle !== "string" ||
    !Object.values(RequirementLifecycle).includes(
      requirementLifecycle as RequirementLifecycle,
    )
  ) {
    throw new JobValidationError("Requirement lifecycle is invalid.");
  }

  return requirementLifecycle as RequirementLifecycle;
}

export function validateJobLifecycleTransition(
  currentLifecycle: RequirementLifecycle,
  nextLifecycle: unknown,
) {
  const validatedNextLifecycle =
    validateRequirementLifecycleValue(nextLifecycle);

  if (
    currentLifecycle === "CLIENT_NOTIFIED" &&
    validatedNextLifecycle === "REQUIREMENT_POSTED"
  ) {
    throw new JobValidationError(
      "Requirement must be completed through the completion workflow.",
    );
  }

  if (
    currentLifecycle === "REQUIREMENT_POSTED" &&
    validatedNextLifecycle === "INTERVIEWER_NOTIFIED"
  ) {
    throw new JobValidationError(
      "Interviewer must be notified through the notification workflow.",
    );
  }

  if (
    currentLifecycle === "INTERVIEWER_NOTIFIED" &&
    validatedNextLifecycle === "SOURCING_SHORTLISTING"
  ) {
    throw new JobValidationError(
      "Sourcing access must be recorded through the database-access workflow.",
    );
  }

  if (
    currentLifecycle === "SOURCING_SHORTLISTING" &&
    validatedNextLifecycle === "BILLING_GENERATED"
  ) {
    throw new JobValidationError("Billing workflow is not available yet.");
  }

  if (
    allowedRequirementLifecycleTransitions[currentLifecycle] !==
    validatedNextLifecycle
  ) {
    throw new JobValidationError("Invalid requirement lifecycle transition.");
  }

  return validatedNextLifecycle;
}

function validateSourcingDatabaseSource(sourcingDatabaseSource: unknown) {
  if (sourcingDatabaseSource === null || sourcingDatabaseSource === undefined) {
    return null;
  }

  if (
    typeof sourcingDatabaseSource !== "string" ||
    !Object.values(SourcingDatabaseSource).includes(
      sourcingDatabaseSource as SourcingDatabaseSource,
    )
  ) {
    throw new JobValidationError("Sourcing database source is invalid.");
  }

  return sourcingDatabaseSource as SourcingDatabaseSource;
}

export async function ensureJobExists(id: number) {
  const job = await prisma.job.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      requirementLifecycle: true,
      sourcingDatabaseSource: true,
      sourcingAccessReceivedAt: true,
      shortlistingDueAt: true,
      shortlistingCompletedAt: true,
      assignedInterviewerId: true,
    },
  });

  if (!job) {
    throw new JobValidationError("Job not found.");
  }

  return job;
}

export function requireConfiguredSourcingDatabaseSource(
  sourcingDatabaseSource: SourcingDatabaseSource | null,
) {
  if (!sourcingDatabaseSource) {
    throw new JobValidationError("Sourcing database source is required.");
  }

  return sourcingDatabaseSource;
}

export function assertSourcingAccessCanBeRecorded(
  requirementLifecycle: RequirementLifecycle,
  sourcingAccessReceivedAt: Date | null,
) {
  if (sourcingAccessReceivedAt) {
    return "ALREADY_RECORDED" as const;
  }

  if (requirementLifecycle !== "INTERVIEWER_NOTIFIED") {
    throw new JobValidationError("Invalid sourcing workflow state.");
  }

  return "READY" as const;
}

export function assertShortlistingCanBeCompleted(
  requirementLifecycle: RequirementLifecycle,
  sourcingAccessReceivedAt: Date | null,
  shortlistingCompletedAt: Date | null,
  shortlistedCount: number,
) {
  if (shortlistingCompletedAt) {
    return "ALREADY_COMPLETED" as const;
  }

  if (!sourcingAccessReceivedAt) {
    throw new JobValidationError("Sourcing access has not been received.");
  }

  if (requirementLifecycle !== "SOURCING_SHORTLISTING") {
    throw new JobValidationError("Invalid sourcing workflow state.");
  }

  if (shortlistedCount < 1) {
    throw new JobValidationError(
      "Cannot complete shortlisting until at least one candidate has been shortlisted.",
    );
  }

  return "READY" as const;
}

export type JobRequirementCompletionFields = {
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

export function validateJobRequirementCompletion(
  fields: JobRequirementCompletionFields,
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

function hasField(
  requirementFields: JobRequirementInput,
  field: keyof JobRequirementInput,
) {
  return Object.prototype.hasOwnProperty.call(requirementFields, field);
}

function validateRequirementFields(
  requirementFields: JobRequirementInput,
  options: ValidateRequirementFieldsOptions = {},
): JobRequirementData {
  const requirementData: JobRequirementData = {};

  if (hasField(requirementFields, "roleCategory")) {
    requirementData.roleCategory = validateRoleCategory(
      requirementFields.roleCategory,
    );
  }

  if (hasField(requirementFields, "experienceRange")) {
    requirementData.experienceRange = validateOptionalString(
      requirementFields.experienceRange,
      "Experience range must be a string or null.",
    );
  }

  if (hasField(requirementFields, "location")) {
    requirementData.location = validateOptionalString(
      requirementFields.location,
      "Location must be a string or null.",
    );
  }

  if (hasField(requirementFields, "compensationRange")) {
    requirementData.compensationRange = validateOptionalString(
      requirementFields.compensationRange,
      "Compensation range must be a string or null.",
    );
  }

  if (hasField(requirementFields, "targetHireDate")) {
    requirementData.targetHireDate = validateOptionalDate(
      requirementFields.targetHireDate,
    );
  }

  if (hasField(requirementFields, "numberOfPositions")) {
    if (
      requirementFields.numberOfPositions === null ||
      requirementFields.numberOfPositions === undefined
    ) {
      requirementData.numberOfPositions = null;
    } else {
      requirementData.numberOfPositions = validatePositiveInteger(
        requirementFields.numberOfPositions,
        "Number of positions must be a positive integer.",
      );
    }
  }

  if (hasField(requirementFields, "mustHaveRequirements")) {
    requirementData.mustHaveRequirements = validateOptionalString(
      requirementFields.mustHaveRequirements,
      "Must-have requirements must be a string or null.",
    );
  }

  if (hasField(requirementFields, "niceToHaveRequirements")) {
    requirementData.niceToHaveRequirements = validateOptionalString(
      requirementFields.niceToHaveRequirements,
      "Nice-to-have requirements must be a string or null.",
    );
  }

  if (hasField(requirementFields, "jobDescription")) {
    requirementData.jobDescription = validateOptionalString(
      requirementFields.jobDescription,
      "Job description must be a string or null.",
    );
  }

  if (hasField(requirementFields, "evaluationCriteria")) {
    requirementData.evaluationCriteria = validateOptionalString(
      requirementFields.evaluationCriteria,
      "Evaluation criteria must be a string or null.",
    );
  }

  if (hasField(requirementFields, "primarySkills")) {
    requirementData.primarySkills = validateOptionalString(
      requirementFields.primarySkills,
      "Primary skills must be a string or null.",
    );
  }

  if (hasField(requirementFields, "requirementLifecycle")) {
    const validatedRequirementLifecycle = validateRequirementLifecycleValue(
      requirementFields.requirementLifecycle,
    );

    if (!options.allowRequirementLifecycle) {
      throw new JobValidationError("Invalid requirement lifecycle transition.");
    }

    if (
      options.requireDraftLifecycle &&
      validatedRequirementLifecycle !== "REQUIREMENT_DRAFTED"
    ) {
      throw new JobValidationError("Invalid requirement lifecycle transition.");
    }

    requirementData.requirementLifecycle = validatedRequirementLifecycle;
  }

  if (hasField(requirementFields, "clientCompletedAt")) {
    requirementData.clientCompletedAt = validateOptionalDate(
      requirementFields.clientCompletedAt,
    );
  }

  if (hasField(requirementFields, "sourcingDatabaseSource")) {
    requirementData.sourcingDatabaseSource = validateSourcingDatabaseSource(
      requirementFields.sourcingDatabaseSource,
    );
  }

  if (hasField(requirementFields, "sourcingAccessDetails")) {
    requirementData.sourcingAccessDetails = validateOptionalString(
      requirementFields.sourcingAccessDetails,
      "Sourcing access details must be a string or null.",
    );
  }

  if (hasField(requirementFields, "sourcingAccessReceivedAt")) {
    requirementData.sourcingAccessReceivedAt = validateOptionalDate(
      requirementFields.sourcingAccessReceivedAt,
    );
  }

  if (hasField(requirementFields, "shortlistingDueAt")) {
    requirementData.shortlistingDueAt = validateOptionalDate(
      requirementFields.shortlistingDueAt,
    );
  }

  if (hasField(requirementFields, "shortlistingCompletedAt")) {
    requirementData.shortlistingCompletedAt = validateOptionalDate(
      requirementFields.shortlistingCompletedAt,
    );
  }

  return requirementData;
}

export async function validateJobInput(
  title: unknown,
  status: unknown,
  companyId: unknown,
  requirementFields: JobRequirementInput = {},
  options: ValidateRequirementFieldsOptions = {},
) {
  const validatedCompanyId = validatePositiveInteger(
    companyId,
    "Company ID must be a positive integer.",
  );

  const company = await prisma.company.findUnique({
    where: {
      id: validatedCompanyId,
    },
    select: {
      id: true,
    },
  });

  if (!company) {
    throw new JobValidationError("Company not found.");
  }

  return {
    title: validateRequiredString(title, "Job title is required."),
    status: validateJobStatus(status),
    companyId: validatedCompanyId,
    ...validateRequirementFields(requirementFields, options),
  };
}

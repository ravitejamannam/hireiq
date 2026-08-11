import {
  ApplicationPipelineStatus,
  SourcingDatabaseSource,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class ApplicationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationValidationError";
  }
}

export class ApplicationTenantIntegrityError extends ApplicationValidationError {
  constructor() {
    super("Candidate and job must belong to the same company.");
    this.name = "ApplicationTenantIntegrityError";
  }
}

export type ValidatedApplicationInput = {
  candidateId: number;
  jobId: number;
  status: ApplicationPipelineStatus;
  source: SourcingDatabaseSource | null;
  expertScore: number | null;
  rejectionReason: string | null;
};

export function validateApplicationId(id: unknown) {
  return validatePositiveInteger(id, "Application ID must be a positive integer.");
}

function validateCandidateId(candidateId: unknown) {
  return validatePositiveInteger(
    candidateId,
    "Candidate ID must be a positive integer.",
  );
}

function validateJobId(jobId: unknown) {
  return validatePositiveInteger(jobId, "Job ID must be a positive integer.");
}

function validatePositiveInteger(value: unknown, message: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new ApplicationValidationError(message);
  }

  return value;
}

function validateApplicationPipelineStatus(status: unknown) {
  if (
    typeof status !== "string" ||
    !Object.values(ApplicationPipelineStatus).includes(
      status as ApplicationPipelineStatus,
    )
  ) {
    throw new ApplicationValidationError(
      "Application pipeline status is invalid.",
    );
  }

  return status as ApplicationPipelineStatus;
}

function validateApplicationSource(source: unknown) {
  if (source === null || source === undefined) {
    return null;
  }

  if (
    typeof source !== "string" ||
    !Object.values(SourcingDatabaseSource).includes(
      source as SourcingDatabaseSource,
    )
  ) {
    throw new ApplicationValidationError("Application source is invalid.");
  }

  return source as SourcingDatabaseSource;
}

function validateExpertScore(expertScore: unknown) {
  if (expertScore === null || expertScore === undefined) {
    return null;
  }

  if (
    typeof expertScore !== "number" ||
    !Number.isFinite(expertScore) ||
    !Number.isInteger(expertScore) ||
    expertScore < 0
  ) {
    throw new ApplicationValidationError(
      "Expert score must be a non-negative integer.",
    );
  }

  return expertScore;
}

export function validateExpertReviewScore(expertScore: unknown) {
  return validateExpertScore(expertScore);
}

export function validateExpertReviewNotes(notes: unknown) {
  if (notes === null || notes === undefined) {
    return null;
  }

  if (typeof notes !== "string") {
    throw new ApplicationValidationError(
      "Expert notes must be a string or null.",
    );
  }

  return notes.trim() || null;
}

export function assertApplicationIsInExpertReview(
  status: ApplicationPipelineStatus,
) {
  if (status !== ApplicationPipelineStatus.EXPERT_REVIEW) {
    throw new ApplicationValidationError(
      "Application must be in Expert Review.",
    );
  }
}

function validateRejectionReason(rejectionReason: unknown) {
  if (rejectionReason === null || rejectionReason === undefined) {
    return null;
  }

  if (typeof rejectionReason !== "string") {
    throw new ApplicationValidationError(
      "Rejection reason must be a string or null.",
    );
  }

  return rejectionReason.trim() || null;
}

export async function ensureApplicationExists(id: number) {
  const application = await prisma.application.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (!application) {
    throw new ApplicationValidationError("Application not found.");
  }

  return application;
}

export async function validateApplicationTenant(
  candidateId: number,
  jobId: number,
) {
  const [candidate, job] = await Promise.all([
    prisma.candidate.findUnique({
      where: {
        id: candidateId,
      },
      select: {
        id: true,
        companyId: true,
      },
    }),
    prisma.job.findUnique({
      where: {
        id: jobId,
      },
      select: {
        id: true,
        companyId: true,
      },
    }),
  ]);

  if (!candidate) {
    throw new ApplicationValidationError("Candidate not found.");
  }

  if (!job) {
    throw new ApplicationValidationError("Job not found.");
  }

  if (candidate.companyId !== job.companyId) {
    throw new ApplicationTenantIntegrityError();
  }

  return {
    candidate,
    job,
  };
}

export async function validateApplicationInput(
  candidateId: unknown,
  jobId: unknown,
  status: unknown,
  source: unknown,
  expertScore: unknown,
  rejectionReason: unknown,
): Promise<ValidatedApplicationInput> {
  const validatedCandidateId = validateCandidateId(candidateId);
  const validatedJobId = validateJobId(jobId);
  const validatedStatus = validateApplicationPipelineStatus(status);
  const validatedSource = validateApplicationSource(source);
  const validatedExpertScore = validateExpertScore(expertScore);
  const validatedRejectionReason = validateRejectionReason(rejectionReason);

  await validateApplicationTenant(validatedCandidateId, validatedJobId);

  return {
    candidateId: validatedCandidateId,
    jobId: validatedJobId,
    status: validatedStatus,
    source: validatedSource,
    expertScore: validatedExpertScore,
    rejectionReason: validatedRejectionReason,
  };
}

export type SourcedCandidateInput = {
  name: unknown;
  role: unknown;
  experienceYears: unknown;
  location: unknown;
  currentEmployer: unknown;
  skills: unknown;
  expectedCTC: unknown;
};

export type ValidatedSourcedCandidateInput = {
  name: string;
  role: string;
  experienceYears: number;
  location: string;
  currentEmployer: string;
  skills: string;
  expectedCTC: string;
};

export function validateSourcingJobId(jobId: unknown) {
  return validateJobId(jobId);
}

export function validateRequiredApplicationSource(source: unknown) {
  if (source === null || source === undefined) {
    throw new ApplicationValidationError("Source is required.");
  }

  if (
    typeof source !== "string" ||
    !Object.values(SourcingDatabaseSource).includes(
      source as SourcingDatabaseSource,
    )
  ) {
    throw new ApplicationValidationError("Application source is invalid.");
  }

  return source as SourcingDatabaseSource;
}

export function validateSourcedCandidateInput(
  candidateInput: SourcedCandidateInput,
): ValidatedSourcedCandidateInput {
  return {
    name: validateRequiredTrimmedString(
      candidateInput.name,
      "Candidate name is required.",
    ),
    role: validateRequiredTrimmedString(
      candidateInput.role,
      "Role is required.",
    ),
    experienceYears: validateNonNegativeInteger(
      candidateInput.experienceYears,
      "Experience years must be a non-negative integer.",
    ),
    location: validateRequiredTrimmedString(
      candidateInput.location,
      "Location is required.",
    ),
    currentEmployer: validateRequiredTrimmedString(
      candidateInput.currentEmployer,
      "Current employer is required.",
    ),
    skills: validateRequiredTrimmedString(
      candidateInput.skills,
      "Skills are required.",
    ),
    expectedCTC: validateRequiredTrimmedString(
      candidateInput.expectedCTC,
      "Expected CTC is required.",
    ),
  };
}

export function assertJobAllowsSourcingIntake(job: {
  requirementLifecycle: string;
  sourcingAccessReceivedAt: Date | null;
}) {
  if (job.requirementLifecycle === "BILLING_GENERATED") {
    throw new ApplicationValidationError(
      "Sourcing intake is not available after billing has been generated.",
    );
  }

  if (
    job.requirementLifecycle === "REQUIREMENT_DRAFTED" ||
    job.requirementLifecycle === "CLIENT_NOTIFIED" ||
    job.requirementLifecycle === "REQUIREMENT_POSTED"
  ) {
    throw new ApplicationValidationError(
      "Requirement must be notified to the interviewer before sourcing.",
    );
  }

  if (
    job.requirementLifecycle !== "INTERVIEWER_NOTIFIED" &&
    job.requirementLifecycle !== "SOURCING_SHORTLISTING"
  ) {
    throw new ApplicationValidationError(
      "Sourcing intake is not available for this requirement lifecycle.",
    );
  }

  if (!job.sourcingAccessReceivedAt) {
    throw new ApplicationValidationError(
      "Database access has not been received for this requirement.",
    );
  }
}

function validateRequiredTrimmedString(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApplicationValidationError(message);
  }

  return value.trim();
}

function validateNonNegativeInteger(value: unknown, message: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new ApplicationValidationError(message);
  }

  return value;
}

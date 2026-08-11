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

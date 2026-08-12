"use server";

import {
  AuthorizationError,
  requireAdmin,
  requireClientPortal,
  requireJobAccess,
  requireUser,
} from "@/lib/auth/authorization";
import { PortalRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { JobStatus, RequirementLifecycle } from "@prisma/client";
import {
  validateJobId,
  validateJobInput,
  validateJobLifecycleTransition,
  validateRequirementLifecycleValue,
  ensureJobExists,
  requireConfiguredSourcingDatabaseSource,
  assertSourcingAccessCanBeRecorded,
  assertShortlistingCanBeCompleted,
  validateJobRequirementCompletion,
  type JobRequirementInput,
  JobValidationError,
} from "@/lib/validation/job-validation";
import {
  ensureInterviewerExists,
  validateNullableInterviewerId,
} from "@/lib/validation/interviewer-validation";

/** Client-editable requirement fields only (never lifecycle/status/sourcing/SLA). */
export type ClientRequirementEditableInput = {
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
};

function revalidateClientRequirementPaths(jobId: number) {
  try {
    revalidatePath("/dashboard/jobs");
    revalidatePath("/dashboard/requirements");
    revalidatePath(`/dashboard/requirements/${jobId}`);
    revalidatePath("/client");
    revalidatePath("/client/requirements");
    revalidatePath(`/client/requirements/${jobId}`);
  } catch {
    // revalidatePath requires a Next.js request context
  }
}

const SHORTLISTING_SLA_HOURS = 24;
export async function createJob(
  title: string,
  status: JobStatus,
  companyId: number,
  requirementFields: JobRequirementInput = {},
) {
  await requireAdmin();
  const validatedJob = await validateJobInput(
    title,
    status,
    companyId,
    requirementFields,
    {
      allowRequirementLifecycle: true,
      requireDraftLifecycle: true,
    },
  );

  const job = await prisma.job.create({
    data: validatedJob,
  });

  revalidatePath("/dashboard/jobs");

  return job;
}

export async function updateJob(
  id: number,
  title: string,
  status: JobStatus,
  companyId: number,
  requirementFields: JobRequirementInput = {},
) {
  await requireAdmin();
  const jobId = validateJobId(id);

  const existingJob = await prisma.job.findUnique({
    where: {
      id: jobId,
    },
    select: {
      id: true,
    },
  });

  if (!existingJob) {
    throw new JobValidationError("Job not found.");
  }

  const validatedJob = await validateJobInput(
    title,
    status,
    companyId,
    requirementFields,
  );

  const job = await prisma.job.update({
    where: {
      id: jobId,
    },
    data: validatedJob,
  });

  revalidatePath("/dashboard/jobs");

  return job;
}

export async function deleteJob(id: number) {
  await requireAdmin();
  const jobId = validateJobId(id);

  const existingJob = await prisma.job.findUnique({
    where: {
      id: jobId,
    },
    select: {
      id: true,
    },
  });

  if (!existingJob) {
    throw new JobValidationError("Job not found.");
  }

  await prisma.job.delete({
    where: {
      id: jobId,
    },
  });

  revalidatePath("/dashboard/jobs");
}

export async function transitionJobLifecycle(
  id: number,
  nextLifecycle: RequirementLifecycle,
) {
  await requireAdmin();
  const jobId = validateJobId(id);
  const validatedNextLifecycle =
    validateRequirementLifecycleValue(nextLifecycle);

  const existingJob = await prisma.job.findUnique({
    where: {
      id: jobId,
    },
    select: {
      id: true,
      requirementLifecycle: true,
    },
  });

  if (!existingJob) {
    throw new JobValidationError("Job not found.");
  }

  const allowedNextLifecycle = validateJobLifecycleTransition(
    existingJob.requirementLifecycle,
    validatedNextLifecycle,
  );

  const job = await prisma.job.update({
    where: {
      id: jobId,
    },
    data: {
      requirementLifecycle: allowedNextLifecycle,
    },
  });

  try {
    revalidatePath("/dashboard/jobs");
  } catch {
    // revalidatePath requires a Next.js request context
  }

  return job;
}

export async function assignInterviewerToJob(
  jobId: number,
  interviewerId: number | null,
) {
  await requireAdmin();
  const validatedJobId = validateJobId(jobId);
  const validatedInterviewerId = validateNullableInterviewerId(interviewerId);

  const existingJob = await prisma.job.findUnique({
    where: {
      id: validatedJobId,
    },
    select: {
      id: true,
    },
  });

  if (!existingJob) {
    throw new JobValidationError("Job not found.");
  }

  if (validatedInterviewerId !== null) {
    await ensureInterviewerExists(validatedInterviewerId);
  }

  const job = await prisma.job.update({
    where: {
      id: validatedJobId,
    },
    data: {
      assignedInterviewerId: validatedInterviewerId,
    },
  });

  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard/interviewers");

  return job;
}

/**
 * Complete requirement: CLIENT_NOTIFIED → REQUIREMENT_POSTED.
 * Admin may complete any requirement; Client may complete only their own.
 */
export async function completeJobRequirement(jobId: number) {
  const user = await requireUser();
  const validatedJobId = validateJobId(jobId);

  if (user.role === PortalRole.ADMIN) {
    // Admin may complete any requirement in the existing workflow.
  } else if (user.role === PortalRole.CLIENT) {
    await requireJobAccess(validatedJobId);
  } else {
    throw new AuthorizationError("Unauthorized.");
  }

  const existingJob = await prisma.job.findUnique({
    where: {
      id: validatedJobId,
    },
    select: {
      id: true,
      title: true,
      requirementLifecycle: true,
      clientCompletedAt: true,
      roleCategory: true,
      experienceRange: true,
      location: true,
      compensationRange: true,
      targetHireDate: true,
      numberOfPositions: true,
      mustHaveRequirements: true,
      niceToHaveRequirements: true,
      jobDescription: true,
      evaluationCriteria: true,
      primarySkills: true,
    },
  });

  if (!existingJob) {
    throw new JobValidationError("Requirement not found.");
  }

  if (existingJob.requirementLifecycle === "REQUIREMENT_POSTED") {
    throw new JobValidationError("Requirement is already posted.");
  }

  if (existingJob.requirementLifecycle !== "CLIENT_NOTIFIED") {
    throw new JobValidationError(
      "Requirement must be in CLIENT_NOTIFIED state.",
    );
  }

  validateJobRequirementCompletion(existingJob);

  const job = await prisma.job.update({
    where: {
      id: validatedJobId,
    },
    data: {
      clientCompletedAt: new Date(),
      requirementLifecycle: "REQUIREMENT_POSTED",
    },
  });

  revalidateClientRequirementPaths(validatedJobId);

  return job;
}

/**
 * Client draft save: updates editable requirement fields only.
 * Does not change lifecycle, status, clientCompletedAt, sourcing, or SLA.
 * Allowed only while lifecycle is CLIENT_NOTIFIED and Job belongs to Client's company.
 */
export async function updateClientRequirement(
  jobId: number,
  title: string,
  fields: ClientRequirementEditableInput,
) {
  const client = await requireClientPortal();
  const validatedJobId = validateJobId(jobId);

  const existingJob = await prisma.job.findFirst({
    where: {
      id: validatedJobId,
      companyId: client.companyId,
    },
    select: {
      id: true,
      status: true,
      companyId: true,
      requirementLifecycle: true,
    },
  });

  if (!existingJob) {
    throw new JobValidationError("Requirement not found.");
  }

  if (existingJob.requirementLifecycle !== "CLIENT_NOTIFIED") {
    throw new JobValidationError("Requirement is not editable.");
  }

  // Explicit allow-list — never accept lifecycle, status, sourcing, or SLA fields.
  const allowedFields: JobRequirementInput = {
    roleCategory: fields.roleCategory,
    experienceRange: fields.experienceRange,
    location: fields.location,
    compensationRange: fields.compensationRange,
    targetHireDate: fields.targetHireDate,
    numberOfPositions: fields.numberOfPositions,
    mustHaveRequirements: fields.mustHaveRequirements,
    niceToHaveRequirements: fields.niceToHaveRequirements,
    jobDescription: fields.jobDescription,
    evaluationCriteria: fields.evaluationCriteria,
    primarySkills: fields.primarySkills,
  };

  const validated = await validateJobInput(
    title,
    existingJob.status,
    existingJob.companyId,
    allowedFields,
  );

  const job = await prisma.job.update({
    where: {
      id: validatedJobId,
    },
    data: {
      title: validated.title,
      roleCategory: validated.roleCategory ?? null,
      experienceRange: validated.experienceRange ?? null,
      location: validated.location ?? null,
      compensationRange: validated.compensationRange ?? null,
      targetHireDate: validated.targetHireDate ?? null,
      numberOfPositions: validated.numberOfPositions ?? null,
      mustHaveRequirements: validated.mustHaveRequirements ?? null,
      niceToHaveRequirements: validated.niceToHaveRequirements ?? null,
      jobDescription: validated.jobDescription ?? null,
      evaluationCriteria: validated.evaluationCriteria ?? null,
      primarySkills: validated.primarySkills ?? null,
    },
  });

  revalidateClientRequirementPaths(validatedJobId);

  return job;
}

export async function notifyAssignedInterviewer(jobId: number) {
  await requireAdmin();
  const validatedJobId = validateJobId(jobId);

  const existingJob = await prisma.job.findUnique({
    where: {
      id: validatedJobId,
    },
    select: {
      id: true,
      title: true,
      requirementLifecycle: true,
      assignedInterviewerId: true,
    },
  });

  if (!existingJob) {
    throw new JobValidationError("Job not found.");
  }

  if (existingJob.requirementLifecycle === "INTERVIEWER_NOTIFIED") {
    throw new JobValidationError("Interviewer has already been notified.");
  }

  if (existingJob.requirementLifecycle !== "REQUIREMENT_POSTED") {
    throw new JobValidationError(
      "Requirement must be posted before notifying interviewer.",
    );
  }

  if (!existingJob.assignedInterviewerId) {
    throw new JobValidationError(
      "Interviewer must be assigned before notification.",
    );
  }

  try {
    await ensureInterviewerExists(existingJob.assignedInterviewerId);
  } catch {
    throw new JobValidationError("Interviewer not found.");
  }

  const message = `Requirement ready for interviewer: ${existingJob.title}`;

  let updatedJob;

  try {
    updatedJob = await prisma.$transaction(async (tx) => {
      await tx.notification.create({
        data: {
          type: "INTERVIEWER_REQUIREMENT_READY",
          message,
          jobId: existingJob.id,
          interviewerId: existingJob.assignedInterviewerId!,
        },
      });

      return tx.job.update({
        where: {
          id: existingJob.id,
        },
        data: {
          requirementLifecycle: "INTERVIEWER_NOTIFIED",
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      throw new JobValidationError("Interviewer not found.");
    }

    throw error;
  }

  try {
    revalidatePath("/dashboard/jobs");
    revalidatePath("/dashboard/notifications");
  } catch {
    // revalidatePath requires a Next.js request context
  }

  return updatedJob;
}

export async function markJobSourcingAccessReceived(jobId: number) {
  await requireAdmin();
  const validatedJobId = validateJobId(jobId);
  const existingJob = await ensureJobExists(validatedJobId);

  requireConfiguredSourcingDatabaseSource(existingJob.sourcingDatabaseSource);

  const accessState = assertSourcingAccessCanBeRecorded(
    existingJob.requirementLifecycle,
    existingJob.sourcingAccessReceivedAt,
  );

  if (accessState === "ALREADY_RECORDED") {
    return prisma.job.findUniqueOrThrow({
      where: {
        id: validatedJobId,
      },
    });
  }

  const sourcingAccessReceivedAt = new Date();
  const shortlistingDueAt = new Date(
    sourcingAccessReceivedAt.getTime() + SHORTLISTING_SLA_HOURS * 60 * 60 * 1000,
  );

  const job = await prisma.job.update({
    where: {
      id: validatedJobId,
    },
    data: {
      sourcingAccessReceivedAt,
      shortlistingDueAt,
      requirementLifecycle: "SOURCING_SHORTLISTING",
    },
  });

  try {
    revalidatePath("/dashboard/jobs");
  } catch {
    // revalidatePath requires a Next.js request context
  }

  return job;
}

export async function completeJobShortlisting(jobId: number) {
  await requireAdmin();
  const validatedJobId = validateJobId(jobId);
  const existingJob = await ensureJobExists(validatedJobId);

  const completionState = assertShortlistingCanBeCompleted(
    existingJob.requirementLifecycle,
    existingJob.sourcingAccessReceivedAt,
    existingJob.shortlistingCompletedAt,
  );

  if (completionState === "ALREADY_COMPLETED") {
    return prisma.job.findUniqueOrThrow({
      where: {
        id: validatedJobId,
      },
    });
  }

  const job = await prisma.job.update({
    where: {
      id: validatedJobId,
    },
    data: {
      shortlistingCompletedAt: new Date(),
    },
  });

  try {
    revalidatePath("/dashboard/jobs");
  } catch {
    // revalidatePath requires a Next.js request context
  }

  return job;
}

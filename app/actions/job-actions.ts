"use server";

import { requireAdmin } from "@/lib/auth/authorization";
import { Prisma } from "@prisma/client";
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

export async function completeJobRequirement(jobId: number) {
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
    throw new JobValidationError("Job not found.");
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

  try {
    revalidatePath("/dashboard/jobs");
  } catch {
    // revalidatePath requires a Next.js request context
  }

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

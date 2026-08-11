"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { JobStatus, RequirementLifecycle } from "@prisma/client";
import {
  validateJobId,
  validateJobInput,
  validateJobLifecycleTransition,
  validateRequirementLifecycleValue,
  type JobRequirementInput,
  JobValidationError,
} from "@/lib/validation/job-validation";
import {
  ensureInterviewerExists,
  validateNullableInterviewerId,
} from "@/lib/validation/interviewer-validation";

export async function createJob(
  title: string,
  status: JobStatus,
  companyId: number,
  requirementFields: JobRequirementInput = {},
) {
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

  revalidatePath("/dashboard/jobs");

  return job;
}

export async function assignInterviewerToJob(
  jobId: number,
  interviewerId: number | null,
) {
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

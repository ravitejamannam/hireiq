"use server";

import {
  AuthorizationError,
  assertInterviewerJobAccess,
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
  type GenericJobRequirementInput,
  JobValidationError,
  assertInterviewerAssignmentNotLocked,
} from "@/lib/validation/job-validation";
import { submitClientRequirementForCompany } from "@/lib/jobs/client-requirement-submission";
import {
  acceptGeneratedJobDescriptionForActor,
  discardGeneratedJobDescriptionForActor,
  generateJobDescriptionForActor,
} from "@/lib/jobs/job-description-ai";
import {
  createDraftSpecificationForJob,
  isPostedOrLater,
  specFieldsFromRecord,
  upsertDraftSpecification,
  publishDraftSpecification,
} from "@/lib/jobs/job-specification";
import {
  dispatchInAppNotification,
  finalizeDatabaseReadyCommunication,
  finalizeRequirementReadyCommunication,
  finalizeShortlistReadyCommunication,
} from "@/lib/communication/notification-service";
import { recordSourcingAccessHandoff } from "@/lib/jobs/sourcing-access-handoff";
import { recordShortlistCompletionHandoff } from "@/lib/jobs/shortlist-completion-handoff";
import { NotificationValidationError } from "@/lib/validation/notification-validation";
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

async function requireJobDescriptionAiActor() {
  const user = await requireUser();

  if (user.role === PortalRole.ADMIN) {
    return {
      userId: user.id,
      companyId: null,
      isAdmin: true as const,
    };
  }

  if (user.role === PortalRole.CLIENT) {
    const client = await requireClientPortal();
    return {
      userId: client.id,
      companyId: client.companyId,
      isAdmin: false as const,
    };
  }

  throw new AuthorizationError("Unauthorized.");
}

export async function createJob(
  title: string,
  status: JobStatus,
  companyId: number,
  requirementFields: GenericJobRequirementInput = {},
) {
  const admin = await requireAdmin();
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

  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.job.create({
      data: validatedJob,
    });

    await createDraftSpecificationForJob({
      jobId: created.id,
      fields: specFieldsFromRecord(created),
      createdByUserId: admin.id,
      db: tx,
    });

    return created;
  });

  revalidatePath("/dashboard/jobs");

  return job;
}

export async function updateJob(
  id: number,
  title: string,
  status: JobStatus,
  companyId: number,
  requirementFields: GenericJobRequirementInput = {},
) {
  const admin = await requireAdmin();
  const jobId = validateJobId(id);

  const existingJob = await prisma.job.findUnique({
    where: {
      id: jobId,
    },
    select: {
      id: true,
      requirementLifecycle: true,
      title: true,
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

  const validatedJob = await validateJobInput(
    title,
    status,
    companyId,
    requirementFields,
  );

  const operationalData = {
    status: validatedJob.status,
    companyId: validatedJob.companyId,
    sourcingDatabaseSource: validatedJob.sourcingDatabaseSource,
    sourcingAccessDetails: validatedJob.sourcingAccessDetails,
  };

  if (isPostedOrLater(existingJob.requirementLifecycle)) {
    const job = await prisma.job.update({
      where: {
        id: jobId,
      },
      data: operationalData,
    });

    revalidatePath("/dashboard/jobs");

    return job;
  }

  const job = await prisma.$transaction(async (tx) => {
    await upsertDraftSpecification({
      jobId: jobId,
      lifecycle: existingJob.requirementLifecycle,
      fields: specFieldsFromRecord({
        title: validatedJob.title,
        roleCategory: validatedJob.roleCategory ?? existingJob.roleCategory,
        experienceRange:
          validatedJob.experienceRange ?? existingJob.experienceRange,
        location: validatedJob.location ?? existingJob.location,
        compensationRange:
          validatedJob.compensationRange ?? existingJob.compensationRange,
        targetHireDate:
          validatedJob.targetHireDate ?? existingJob.targetHireDate,
        numberOfPositions:
          validatedJob.numberOfPositions ?? existingJob.numberOfPositions,
        mustHaveRequirements:
          validatedJob.mustHaveRequirements ?? existingJob.mustHaveRequirements,
        niceToHaveRequirements:
          validatedJob.niceToHaveRequirements ??
          existingJob.niceToHaveRequirements,
        jobDescription:
          validatedJob.jobDescription ?? existingJob.jobDescription,
        evaluationCriteria:
          validatedJob.evaluationCriteria ?? existingJob.evaluationCriteria,
        primarySkills: validatedJob.primarySkills ?? existingJob.primarySkills,
      }),
      createdByUserId: admin.id,
      db: tx,
    });

    return tx.job.update({
      where: {
        id: jobId,
      },
      data: operationalData,
    });
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

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: jobId },
      data: { currentPublishedSpecificationVersionId: null },
    });
    await tx.jobSpecificationVersion.deleteMany({
      where: { jobId },
    });
    await tx.job.delete({
      where: { id: jobId },
    });
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
      requirementLifecycle: true,
      assignedInterviewerId: true,
    },
  });

  if (!existingJob) {
    throw new JobValidationError("Job not found.");
  }

  assertInterviewerAssignmentNotLocked(
    existingJob.requirementLifecycle,
    existingJob.assignedInterviewerId,
    validatedInterviewerId,
  );

  if (existingJob.assignedInterviewerId === validatedInterviewerId) {
    return prisma.job.findUniqueOrThrow({
      where: {
        id: validatedJobId,
      },
    });
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
 * Lifecycle transition is conditional so concurrent requests cannot both win.
 */
export async function completeJobRequirement(jobId: number) {
  const user = await requireUser();
  const validatedJobId = validateJobId(jobId);

  let companyIdFilter: number | undefined;

  if (user.role === PortalRole.ADMIN) {
    // Admin may complete any requirement in the existing workflow.
  } else if (user.role === PortalRole.CLIENT) {
    const client = await requireClientPortal();
    await requireJobAccess(validatedJobId);
    companyIdFilter = client.companyId;
  } else {
    throw new AuthorizationError("Unauthorized.");
  }

  const existingJob = await prisma.job.findFirst({
    where: {
      id: validatedJobId,
      ...(companyIdFilter !== undefined
        ? { companyId: companyIdFilter }
        : {}),
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

  const job = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "Job" WHERE "id" = ${validatedJobId} FOR UPDATE
    `;

    await publishDraftSpecification({
      jobId: validatedJobId,
      createdByUserId: user.id,
      db: tx,
    });

    const transition = await tx.job.updateMany({
      where: {
        id: validatedJobId,
        requirementLifecycle: "CLIENT_NOTIFIED",
        ...(companyIdFilter !== undefined
          ? { companyId: companyIdFilter }
          : {}),
      },
      data: {
        clientCompletedAt: new Date(),
        requirementLifecycle: "REQUIREMENT_POSTED",
      },
    });

    if (transition.count !== 1) {
      throw new JobValidationError(
        "Requirement is no longer available for completion.",
      );
    }

    return tx.job.findUniqueOrThrow({
      where: {
        id: validatedJobId,
      },
    });
  });

  revalidateClientRequirementPaths(validatedJobId);

  return job;
}

/**
 * Client draft save: updates editable requirement fields only.
 * Does not change lifecycle, status, clientCompletedAt, sourcing, or SLA.
 * Allowed while lifecycle is REQUIREMENT_DRAFTED or CLIENT_NOTIFIED.
 * Company comes from ACTIVE membership, never from the request.
 */
export async function updateClientRequirement(
  jobId: number,
  title: string,
  fields: ClientRequirementEditableInput,
  expectedUpdatedAt?: Date | string | null,
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

  if (
    existingJob.requirementLifecycle !== "REQUIREMENT_DRAFTED" &&
    existingJob.requirementLifecycle !== "CLIENT_NOTIFIED"
  ) {
    throw new JobValidationError("Requirement is not editable.");
  }

  // Explicit allow-list — never accept lifecycle, status, sourcing timestamps, or SLA.
  const allowedFields: GenericJobRequirementInput = {
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

  const parsedExpectedUpdatedAt =
    expectedUpdatedAt instanceof Date
      ? expectedUpdatedAt
      : typeof expectedUpdatedAt === "string" && expectedUpdatedAt
        ? new Date(expectedUpdatedAt)
        : null;

  const job = await prisma.$transaction(async (tx) => {
    await upsertDraftSpecification({
      jobId: validatedJobId,
      lifecycle: existingJob.requirementLifecycle,
      fields: specFieldsFromRecord({
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
      }),
      expectedUpdatedAt: parsedExpectedUpdatedAt,
      createdByUserId: client.id,
      requireOptimisticLock: true,
      db: tx,
    });

    return tx.job.findUniqueOrThrow({
      where: { id: validatedJobId },
    });
  });

  revalidateClientRequirementPaths(validatedJobId);

  return job;
}

/**
 * Client submission: REQUIREMENT_DRAFTED → CLIENT_NOTIFIED.
 * Does not complete, publish, or plant workflow timestamps.
 * Company comes from ACTIVE membership, never from the request.
 */
export async function submitClientRequirement(jobId: number) {
  const client = await requireClientPortal();
  const validatedJobId = validateJobId(jobId);

  const job = await submitClientRequirementForCompany({
    jobId: validatedJobId,
    companyId: client.companyId,
  });

  revalidateClientRequirementPaths(validatedJobId);

  return job;
}

export async function generateJobDescription(jobId: number) {
  const actor = await requireJobDescriptionAiActor();
  const validatedJobId = validateJobId(jobId);
  const version = await generateJobDescriptionForActor({
    jobId: validatedJobId,
    actor,
  });
  revalidateClientRequirementPaths(validatedJobId);
  return version;
}

export async function acceptGeneratedJobDescription(jobId: number) {
  const actor = await requireJobDescriptionAiActor();
  const validatedJobId = validateJobId(jobId);
  const version = await acceptGeneratedJobDescriptionForActor({
    jobId: validatedJobId,
    actor,
  });
  revalidateClientRequirementPaths(validatedJobId);
  return version;
}

export async function discardGeneratedJobDescription(jobId: number) {
  const actor = await requireJobDescriptionAiActor();
  const validatedJobId = validateJobId(jobId);
  const version = await discardGeneratedJobDescriptionForActor({
    jobId: validatedJobId,
    actor,
  });
  revalidateClientRequirementPaths(validatedJobId);
  return version;
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
  const assignedInterviewerId = existingJob.assignedInterviewerId;

  let updatedJob;
  let inAppResult: Awaited<
    ReturnType<typeof dispatchInAppNotification>
  >;

  try {
    const committed = await prisma.$transaction(async (tx) => {
      // Lifecycle transition is the concurrency gate.
      const transition = await tx.job.updateMany({
        where: {
          id: existingJob.id,
          requirementLifecycle: "REQUIREMENT_POSTED",
          assignedInterviewerId,
        },
        data: {
          requirementLifecycle: "INTERVIEWER_NOTIFIED",
        },
      });

      if (transition.count !== 1) {
        throw new JobValidationError(
          "Requirement is no longer available for interviewer notification.",
        );
      }

      const notificationResult = await dispatchInAppNotification(
        {
          type: "INTERVIEWER_REQUIREMENT_READY",
          message,
          jobId: existingJob.id,
        },
        tx,
      );

      const job = await tx.job.findUniqueOrThrow({
        where: {
          id: existingJob.id,
        },
      });

      return { job, notificationResult };
    });

    updatedJob = committed.job;
    inAppResult = committed.notificationResult;
  } catch (error) {
    if (error instanceof JobValidationError) {
      throw error;
    }

    if (error instanceof NotificationValidationError) {
      throw new JobValidationError(error.message);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003") {
        throw new JobValidationError("Interviewer not found.");
      }

      if (error.code === "P2002") {
        throw new JobValidationError(
          "Interviewer has already been notified.",
        );
      }
    }

    throw error;
  }

  try {
    revalidatePath("/dashboard/jobs");
    revalidatePath("/dashboard/notifications");
    revalidatePath(`/dashboard/requirements/${existingJob.id}`);
  } catch {
    // revalidatePath requires a Next.js request context
  }

  const email = await finalizeRequirementReadyCommunication(inAppResult);

  return {
    job: updatedJob,
    email,
  };
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
    return {
      job: await prisma.job.findUniqueOrThrow({
        where: {
          id: validatedJobId,
        },
      }),
      email: null,
    };
  }

  let committed;

  try {
    committed = await recordSourcingAccessHandoff(validatedJobId);
  } catch (error) {
    if (error instanceof JobValidationError) {
      throw error;
    }

    if (error instanceof NotificationValidationError) {
      throw new JobValidationError(error.message);
    }

    throw error;
  }

  try {
    revalidatePath("/dashboard/jobs");
    revalidatePath("/dashboard/notifications");
    revalidatePath(`/dashboard/requirements/${existingJob.id}`);
  } catch {
    // revalidatePath requires a Next.js request context
  }

  if (committed.established) {
    const email = await finalizeDatabaseReadyCommunication(committed.inApp);
    return {
      job: await prisma.job.findUniqueOrThrow({
        where: {
          id: validatedJobId,
        },
      }),
      email,
    };
  }

  return {
    job: await prisma.job.findUniqueOrThrow({
      where: {
        id: validatedJobId,
      },
    }),
    email: null,
  };
}

export async function completeJobShortlisting(jobId: number) {
  const user = await requireUser();
  const validatedJobId = validateJobId(jobId);
  const existingJob = await ensureJobExists(validatedJobId);

  if (user.role === PortalRole.ADMIN) {
    // Admin retains operational oversight of shortlist completion.
  } else if (user.role === PortalRole.INTERVIEWER) {
    assertInterviewerJobAccess(user, existingJob);
  } else {
    throw new AuthorizationError("Unauthorized.");
  }

  const shortlistedCount = await prisma.application.count({
    where: {
      jobId: validatedJobId,
      status: "SHORTLISTED",
    },
  });

  const completionState = assertShortlistingCanBeCompleted(
    existingJob.requirementLifecycle,
    existingJob.sourcingAccessReceivedAt,
    existingJob.shortlistingCompletedAt,
    shortlistedCount,
  );

  if (completionState === "ALREADY_COMPLETED") {
    return {
      job: await prisma.job.findUniqueOrThrow({
        where: {
          id: validatedJobId,
        },
      }),
      email: null,
    };
  }

  let committed;

  try {
    committed = await recordShortlistCompletionHandoff(validatedJobId);
  } catch (error) {
    if (error instanceof JobValidationError) {
      throw error;
    }

    if (error instanceof NotificationValidationError) {
      throw new JobValidationError(error.message);
    }

    throw error;
  }

  try {
    revalidatePath("/dashboard/jobs");
    revalidatePath("/dashboard/notifications");
    revalidatePath("/dashboard/shortlist");
    revalidatePath(`/dashboard/requirements/${existingJob.id}`);
    revalidatePath(`/client/requirements/${existingJob.id}`);
    revalidatePath(`/client/requirements/${existingJob.id}/shortlist`);
    revalidatePath(`/interviewer/requirements/${existingJob.id}`);
  } catch {
    // revalidatePath requires a Next.js request context
  }

  if (committed.established) {
    const email = await finalizeShortlistReadyCommunication(committed.inApp);
    return {
      job: await prisma.job.findUniqueOrThrow({
        where: {
          id: validatedJobId,
        },
      }),
      email,
    };
  }

  return {
    job: await prisma.job.findUniqueOrThrow({
      where: {
        id: validatedJobId,
      },
    }),
    email: null,
  };
}

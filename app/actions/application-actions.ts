"use server";

import { prisma } from "@/lib/prisma";
import {
  ensureApplicationExists,
  validateApplicationId,
  validateApplicationInput,
} from "@/lib/validation/application-validation";
import { revalidatePath } from "next/cache";
import {
  ApplicationPipelineStatus,
  Prisma,
  SourcingDatabaseSource,
} from "@prisma/client";

export async function createApplication(
  candidateId: number,
  jobId: number,
  status: ApplicationPipelineStatus = ApplicationPipelineStatus.CV_POOL,
  source: SourcingDatabaseSource | null = null,
  expertScore: number | null = null,
  rejectionReason: string | null = null,
) {
  const applicationInput = await validateApplicationInput(
    candidateId,
    jobId,
    status,
    source,
    expertScore,
    rejectionReason,
  );

  try {
    const application = await prisma.application.create({
      data: applicationInput,
    });

    revalidatePath("/dashboard/applications");

    return application;
  } catch (error) {
    throw translateApplicationSaveError(error);
  }
}

export async function updateApplication(
  id: number,
  candidateId: number,
  jobId: number,
  status: ApplicationPipelineStatus,
  source: SourcingDatabaseSource | null = null,
  expertScore: number | null = null,
  rejectionReason: string | null = null,
) {
  const applicationId = validateApplicationId(id);
  await ensureApplicationExists(applicationId);

  const applicationInput = await validateApplicationInput(
    candidateId,
    jobId,
    status,
    source,
    expertScore,
    rejectionReason,
  );

  try {
    const application = await prisma.application.update({
      where: {
        id: applicationId,
      },
      data: applicationInput,
    });

    revalidatePath("/dashboard/applications");

    return application;
  } catch (error) {
    throw translateApplicationSaveError(error);
  }
}

export async function deleteApplication(id: number) {
  const applicationId = validateApplicationId(id);
  await ensureApplicationExists(applicationId);

  try {
    await prisma.application.delete({
      where: {
        id: applicationId,
      },
    });

    revalidatePath("/dashboard/applications");
  } catch (error) {
    throw translateApplicationDeleteError(error);
  }
}

const APPLICATION_STATUS_TRANSITIONS: Record<
  ApplicationPipelineStatus,
  ApplicationPipelineStatus[]
> = {
  [ApplicationPipelineStatus.CV_POOL]: [
    ApplicationPipelineStatus.EXPERT_REVIEW,
    ApplicationPipelineStatus.REJECTED,
  ],
  [ApplicationPipelineStatus.EXPERT_REVIEW]: [
    ApplicationPipelineStatus.TECH_EVALUATION,
    ApplicationPipelineStatus.REJECTED,
  ],
  [ApplicationPipelineStatus.TECH_EVALUATION]: [
    ApplicationPipelineStatus.SHORTLISTED,
    ApplicationPipelineStatus.REJECTED,
  ],
  [ApplicationPipelineStatus.SHORTLISTED]: [
    ApplicationPipelineStatus.SELECTED,
    ApplicationPipelineStatus.REJECTED,
  ],
  [ApplicationPipelineStatus.SELECTED]: [ApplicationPipelineStatus.HIRED],
  [ApplicationPipelineStatus.REJECTED]: [],
  [ApplicationPipelineStatus.HIRED]: [],
};

function getValidApplicationStatusTransitions(
  currentStatus: ApplicationPipelineStatus,
) {
  return APPLICATION_STATUS_TRANSITIONS[currentStatus] ?? [];
}

function isApplicationPipelineStatus(
  status: unknown,
): status is ApplicationPipelineStatus {
  return (
    typeof status === "string" &&
    Object.values(ApplicationPipelineStatus).includes(
      status as ApplicationPipelineStatus,
    )
  );
}

export async function transitionApplicationStatus(
  id: number,
  nextStatus: ApplicationPipelineStatus,
) {
  const applicationId = validateApplicationId(id);

  if (!isApplicationPipelineStatus(nextStatus)) {
    throw new Error("Application status is invalid.");
  }

  const application = await prisma.application.findUnique({
    where: {
      id: applicationId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!application) {
    throw new Error("Application not found.");
  }

  const allowedTransitions = getValidApplicationStatusTransitions(
    application.status,
  );

  if (!allowedTransitions.includes(nextStatus)) {
    throw new Error("Invalid application status transition.");
  }

  let updatedApplication;

  try {
    updatedApplication = await prisma.application.update({
      where: {
        id: applicationId,
      },
      data: {
        status: nextStatus,
      },
    });
  } catch (error) {
    throw translateApplicationSaveError(error);
  }

  try {
    revalidatePath("/dashboard/pipeline");
    revalidatePath("/dashboard/applications");
  } catch {
    // revalidatePath requires a Next.js request context
  }

  return updatedApplication;
}

function translateApplicationSaveError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new Error("Application already exists for this candidate and job.");
    }

    if (error.code === "P2003") {
      return new Error(
        "Cannot modify or delete this application because related records exist.",
      );
    }

    if (error.code === "P2025") {
      return new Error("Application not found.");
    }
  }

  return new Error("Unable to save application.");
}

function translateApplicationDeleteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003") {
      return new Error(
        "Cannot modify or delete this application because related records exist.",
      );
    }

    if (error.code === "P2025") {
      return new Error("Application not found.");
    }
  }

  return new Error("Unable to delete application.");
}

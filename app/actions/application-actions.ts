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

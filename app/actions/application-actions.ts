"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ApplicationStatus } from "@prisma/client";

export async function createApplication(
  candidateId: number,
  jobId: number,
  status: ApplicationStatus,
) {
  const application = await prisma.application.create({
    data: {
      candidateId,
      jobId,
      status,
    },
  });

  revalidatePath("/dashboard/applications");

  return application;
}

export async function updateApplication(
  id: number,
  candidateId: number,
  jobId: number,
  status: ApplicationStatus,
) {
  const application = await prisma.application.update({
    where: {
      id,
    },
    data: {
      candidateId,
      jobId,
      status,
    },
  });

  revalidatePath("/dashboard/applications");

  return application;
}

export async function deleteApplication(id: number) {
  await prisma.application.delete({
    where: {
      id,
    },
  });

  revalidatePath("/dashboard/applications");
}

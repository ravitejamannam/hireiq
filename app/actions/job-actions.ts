"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { JobStatus } from "@prisma/client";

export async function createJob(
  title: string,
  status: JobStatus,
  companyId: number,
) {
  const job = await prisma.job.create({
    data: {
      title,
      status,
      companyId,
    },
  });

  revalidatePath("/dashboard/jobs");

  return job;
}

export async function updateJob(
  id: number,
  title: string,
  status: JobStatus,
  companyId: number,
) {
  const job = await prisma.job.update({
    where: {
      id,
    },
    data: {
      title,
      status,
      companyId,
    },
  });

  revalidatePath("/dashboard/jobs");

  return job;
}

export async function deleteJob(id: number) {
  await prisma.job.delete({
    where: {
      id,
    },
  });

  revalidatePath("/dashboard/jobs");
}

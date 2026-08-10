"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Recommendation } from "@prisma/client";

export async function createReport(
  applicationId: number,
  recommendation: Recommendation,
  notes: string | null,
) {
  const report = await prisma.report.create({
    data: {
      applicationId,
      recommendation,
      notes,
    },
  });

  revalidatePath("/dashboard/reports");

  return report;
}

export async function updateReport(
  id: number,
  applicationId: number,
  recommendation: Recommendation,
  notes: string | null,
) {
  const report = await prisma.report.update({
    where: {
      id,
    },
    data: {
      applicationId,
      recommendation,
      notes,
    },
  });

  revalidatePath("/dashboard/reports");

  return report;
}

export async function deleteReport(id: number) {
  await prisma.report.delete({
    where: {
      id,
    },
  });

  revalidatePath("/dashboard/reports");
}

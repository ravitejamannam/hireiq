"use server";

import { requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { CodingTestStatus } from "@prisma/client";

export async function createCodingTest(
  applicationId: number,
  title: string,
  score: number,
  maxScore: number,
  status: CodingTestStatus,
  takenAt: Date,
) {
  await requireAdmin();
  const codingTest = await prisma.codingTest.create({
    data: {
      applicationId,
      title,
      score,
      maxScore,
      status,
      takenAt,
    },
  });

  revalidatePath("/dashboard/coding-tests");

  return codingTest;
}

export async function updateCodingTest(
  id: number,
  applicationId: number,
  title: string,
  score: number,
  maxScore: number,
  status: CodingTestStatus,
  takenAt: Date,
) {
  await requireAdmin();
  const codingTest = await prisma.codingTest.update({
    where: {
      id,
    },
    data: {
      applicationId,
      title,
      score,
      maxScore,
      status,
      takenAt,
    },
  });

  revalidatePath("/dashboard/coding-tests");

  return codingTest;
}

export async function deleteCodingTest(id: number) {
  await requireAdmin();
  await prisma.codingTest.delete({
    where: {
      id,
    },
  });

  revalidatePath("/dashboard/coding-tests");
}

"use server";

import { requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { InterviewResult, InterviewType } from "@prisma/client";

export async function createInterview(
  applicationId: number,
  type: InterviewType,
  interviewAt: Date,
  result: InterviewResult,
) {
  await requireAdmin();
  const interview = await prisma.interview.create({
    data: {
      applicationId,
      type,
      interviewAt,
      result,
    },
  });

  revalidatePath("/dashboard/interviews");

  return interview;
}

export async function updateInterview(
  id: number,
  applicationId: number,
  type: InterviewType,
  interviewAt: Date,
  result: InterviewResult,
) {
  await requireAdmin();
  const interview = await prisma.interview.update({
    where: {
      id,
    },
    data: {
      applicationId,
      type,
      interviewAt,
      result,
    },
  });

  revalidatePath("/dashboard/interviews");

  return interview;
}

export async function deleteInterview(id: number) {
  await requireAdmin();
  await prisma.interview.delete({
    where: {
      id,
    },
  });

  revalidatePath("/dashboard/interviews");
}

"use server";

import { requireAdmin } from "@/lib/auth/authorization";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  ensureInterviewerExists,
  InterviewerValidationError,
  validateInterviewerId,
  validateInterviewerInput,
} from "@/lib/validation/interviewer-validation";
import type {
  InterviewerAvailability,
  InterviewerCategory,
} from "@prisma/client";

export async function createInterviewer(
  name: string,
  category: InterviewerCategory,
  availability: InterviewerAvailability,
) {
  await requireAdmin();
  const validatedInterviewer = validateInterviewerInput(
    name,
    category,
    availability,
  );

  const interviewer = await prisma.interviewer.create({
    data: validatedInterviewer,
  });

  revalidatePath("/dashboard/interviewers");

  return interviewer;
}

export async function updateInterviewer(
  id: number,
  name: string,
  category: InterviewerCategory,
  availability: InterviewerAvailability,
) {
  await requireAdmin();
  const interviewerId = validateInterviewerId(id);

  await ensureInterviewerExists(interviewerId);

  const validatedInterviewer = validateInterviewerInput(
    name,
    category,
    availability,
  );

  const interviewer = await prisma.interviewer.update({
    where: {
      id: interviewerId,
    },
    data: validatedInterviewer,
  });

  revalidatePath("/dashboard/interviewers");
  revalidatePath("/dashboard/jobs");

  return interviewer;
}

export async function deleteInterviewer(id: number) {
  await requireAdmin();
  const interviewerId = validateInterviewerId(id);

  await ensureInterviewerExists(interviewerId);

  try {
    await prisma.interviewer.delete({
      where: {
        id: interviewerId,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      throw new InterviewerValidationError(
        "Interviewer is assigned to a requirement and cannot be deleted.",
      );
    }

    throw error;
  }

  revalidatePath("/dashboard/interviewers");
  revalidatePath("/dashboard/jobs");
}

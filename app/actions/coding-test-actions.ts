"use server";

import { revalidatePath } from "next/cache";
import type { CodingTestStatus } from "@prisma/client";

import {
  assertInterviewerOwnsApplication,
  assertInterviewerOwnsCodingTest,
} from "@/lib/auth/interviewer-assignment";
import { prisma } from "@/lib/prisma";
import { validateApplicationId } from "@/lib/validation/application-validation";
import {
  validateCodingTestId,
  validateCodingTestInput,
} from "@/lib/validation/coding-test-validation";

export async function createCodingTest(
  applicationId: number,
  title: string,
  score: number,
  maxScore: number,
  status: CodingTestStatus,
  takenAt: Date,
) {
  const validatedApplicationId = validateApplicationId(applicationId);
  const { application } = await assertInterviewerOwnsApplication(
    validatedApplicationId,
  );
  const fields = validateCodingTestInput(
    title,
    score,
    maxScore,
    status,
    takenAt,
  );

  const codingTest = await prisma.codingTest.create({
    data: {
      applicationId: application.id,
      title: fields.title,
      score: fields.score,
      maxScore: fields.maxScore,
      status: fields.status,
      takenAt: fields.takenAt,
    },
  });

  revalidateInterviewerEvidencePaths(application.jobId, application.id);

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
  const codingTestId = validateCodingTestId(id);
  validateApplicationId(applicationId);
  const { codingTest } = await assertInterviewerOwnsCodingTest(codingTestId);
  const fields = validateCodingTestInput(
    title,
    score,
    maxScore,
    status,
    takenAt,
  );

  const updated = await prisma.codingTest.update({
    where: {
      id: codingTest.id,
    },
    data: {
      title: fields.title,
      score: fields.score,
      maxScore: fields.maxScore,
      status: fields.status,
      takenAt: fields.takenAt,
    },
  });

  revalidateInterviewerEvidencePaths(
    codingTest.application.jobId,
    codingTest.applicationId,
  );

  return updated;
}

export async function deleteCodingTest(id: number) {
  const codingTestId = validateCodingTestId(id);
  const { codingTest } = await assertInterviewerOwnsCodingTest(codingTestId);

  await prisma.codingTest.delete({
    where: {
      id: codingTest.id,
    },
  });

  revalidateInterviewerEvidencePaths(
    codingTest.application.jobId,
    codingTest.applicationId,
  );
}

function revalidateInterviewerEvidencePaths(
  jobId: number,
  applicationId: number,
) {
  try {
    revalidatePath("/interviewer");
    revalidatePath("/interviewer/requirements");
    revalidatePath(`/interviewer/requirements/${jobId}`);
    revalidatePath(
      `/interviewer/requirements/${jobId}/candidates/${applicationId}`,
    );
    revalidatePath(`/client/requirements/${jobId}`);
    revalidatePath(
      `/client/requirements/${jobId}/candidates/${applicationId}`,
    );
    revalidatePath(`/dashboard/requirements/${jobId}`);
    revalidatePath("/dashboard/technical-evaluations");
  } catch {
    // revalidatePath requires a Next.js request context
  }
}

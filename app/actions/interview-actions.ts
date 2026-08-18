"use server";

import { revalidatePath } from "next/cache";
import type { InterviewResult, InterviewType } from "@prisma/client";

import {
  assertInterviewerOwnsApplication,
  assertInterviewerOwnsInterview,
} from "@/lib/auth/interviewer-assignment";
import { prisma } from "@/lib/prisma";
import { validateApplicationId } from "@/lib/validation/application-validation";
import {
  validateInterviewId,
  validateInterviewInput,
} from "@/lib/validation/interview-validation";

export async function createInterview(
  applicationId: number,
  type: InterviewType,
  interviewAt: Date,
  result: InterviewResult,
) {
  const validatedApplicationId = validateApplicationId(applicationId);
  const { application } = await assertInterviewerOwnsApplication(
    validatedApplicationId,
  );
  const fields = validateInterviewInput(type, interviewAt, result);

  const interview = await prisma.interview.create({
    data: {
      applicationId: application.id,
      type: fields.type,
      interviewAt: fields.interviewAt,
      result: fields.result,
    },
  });

  revalidateInterviewerEvidencePaths(application.jobId, application.id);

  return interview;
}

export async function updateInterview(
  id: number,
  applicationId: number,
  type: InterviewType,
  interviewAt: Date,
  result: InterviewResult,
) {
  const interviewId = validateInterviewId(id);
  validateApplicationId(applicationId);
  const { interview } = await assertInterviewerOwnsInterview(interviewId);
  const fields = validateInterviewInput(type, interviewAt, result);

  const updated = await prisma.interview.update({
    where: {
      id: interview.id,
    },
    data: {
      type: fields.type,
      interviewAt: fields.interviewAt,
      result: fields.result,
    },
  });

  revalidateInterviewerEvidencePaths(
    interview.application.jobId,
    interview.applicationId,
  );

  return updated;
}

export async function deleteInterview(id: number) {
  const interviewId = validateInterviewId(id);
  const { interview } = await assertInterviewerOwnsInterview(interviewId);

  await prisma.interview.delete({
    where: {
      id: interview.id,
    },
  });

  revalidateInterviewerEvidencePaths(
    interview.application.jobId,
    interview.applicationId,
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

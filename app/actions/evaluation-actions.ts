"use server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getEvaluationForApplication } from "@/lib/repositories/evaluation-repository";
import {
  ensureEvaluationExists,
  ensureEvaluationQuestionExists,
  resolveAssignedInterviewerForApplication,
  validateEvaluationId,
  validateEvaluationInput,
  validateEvaluationQuestionId,
  validateEvaluationQuestionInput,
  EvaluationValidationError,
} from "@/lib/validation/evaluation-validation";
import type {
  EvaluationFieldsInput,
  EvaluationQuestionFieldsInput,
  ValidatedEvaluationInput,
} from "@/lib/validation/evaluation-validation";
import { revalidatePath } from "next/cache";
import { ApplicationPipelineStatus } from "@prisma/client";

export async function createEvaluation(
  applicationId: number,
  interviewerId: number,
  fields: EvaluationFieldsInput = {},
) {
  const evaluationInput = await validateEvaluationInput(
    applicationId,
    interviewerId,
    fields,
  );

  try {
    return await prisma.evaluation.create({
      data: toEvaluationData(evaluationInput),
    });
  } catch (error) {
    throw translateEvaluationSaveError(error);
  }
}

export async function updateEvaluation(
  id: number,
  applicationId: number,
  interviewerId: number,
  fields: EvaluationFieldsInput = {},
) {
  const evaluationId = validateEvaluationId(id);
  await ensureEvaluationExists(evaluationId);

  const evaluationInput = await validateEvaluationInput(
    applicationId,
    interviewerId,
    fields,
  );

  try {
    return await prisma.evaluation.update({
      where: {
        id: evaluationId,
      },
      data: toEvaluationData(evaluationInput),
    });
  } catch (error) {
    throw translateEvaluationSaveError(error);
  }
}

export async function deleteEvaluation(id: number) {
  const evaluationId = validateEvaluationId(id);
  await ensureEvaluationExists(evaluationId);

  try {
    await prisma.evaluation.delete({
      where: {
        id: evaluationId,
      },
    });
  } catch (error) {
    throw translateEvaluationDeleteError(error);
  }
}

export async function createEvaluationQuestion(
  evaluationId: number,
  question: string,
  fields: EvaluationQuestionFieldsInput = {},
) {
  const evaluationQuestionInput = await validateEvaluationQuestionInput(
    evaluationId,
    question,
    fields,
  );

  try {
    const question = await prisma.evaluationQuestion.create({
      data: evaluationQuestionInput,
    });

    try {
      revalidatePath("/dashboard/evaluations");
      revalidatePath("/dashboard/technical-evaluations");
    } catch {
      // revalidatePath requires a Next.js request context
    }

    return question;
  } catch (error) {
    throw translateEvaluationQuestionSaveError(error);
  }
}

export async function updateEvaluationQuestion(
  id: number,
  evaluationId: number,
  question: string,
  fields: EvaluationQuestionFieldsInput = {},
) {
  const evaluationQuestionId = validateEvaluationQuestionId(id);
  await ensureEvaluationQuestionExists(evaluationQuestionId);

  const evaluationQuestionInput = await validateEvaluationQuestionInput(
    evaluationId,
    question,
    fields,
  );

  try {
    const question = await prisma.evaluationQuestion.update({
      where: {
        id: evaluationQuestionId,
      },
      data: evaluationQuestionInput,
    });

    try {
      revalidatePath("/dashboard/evaluations");
      revalidatePath("/dashboard/technical-evaluations");
    } catch {
      // revalidatePath requires a Next.js request context
    }

    return question;
  } catch (error) {
    throw translateEvaluationQuestionSaveError(error);
  }
}

export async function deleteEvaluationQuestion(id: number) {
  const evaluationQuestionId = validateEvaluationQuestionId(id);
  await ensureEvaluationQuestionExists(evaluationQuestionId);

  try {
    await prisma.evaluationQuestion.delete({
      where: {
        id: evaluationQuestionId,
      },
    });
  } catch (error) {
    throw translateEvaluationQuestionDeleteError(error);
  }

  try {
    revalidatePath("/dashboard/evaluations");
    revalidatePath("/dashboard/technical-evaluations");
  } catch {
    // revalidatePath requires a Next.js request context
  }
}

export async function saveTechnicalEvaluation(
  applicationId: number,
  fields: EvaluationFieldsInput = {},
) {
  if (
    typeof applicationId !== "number" ||
    !Number.isFinite(applicationId) ||
    !Number.isInteger(applicationId) ||
    applicationId <= 0
  ) {
    throw new EvaluationValidationError(
      "Application ID must be a positive integer.",
    );
  }

  const { application, interviewerId } =
    await resolveAssignedInterviewerForApplication(applicationId);

  if (application.status !== ApplicationPipelineStatus.TECH_EVALUATION) {
    throw new EvaluationValidationError(
      "Application must be in Technical Evaluation.",
    );
  }

  const evaluationInput = await validateEvaluationInput(
    application.id,
    interviewerId,
    fields,
  );

  let evaluation;

  try {
    evaluation = await prisma.$transaction(async (tx) => {
      const existing = await tx.evaluation.findFirst({
        where: {
          applicationId: application.id,
          interviewerId,
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
        },
      });

      const data = toEvaluationData(evaluationInput);

      if (existing) {
        return tx.evaluation.update({
          where: {
            id: existing.id,
          },
          data,
        });
      }

      return tx.evaluation.create({
        data,
      });
    });
  } catch (error) {
    if (error instanceof EvaluationValidationError) {
      throw error;
    }

    throw translateEvaluationSaveError(error);
  }

  try {
    revalidatePath("/dashboard/technical-evaluations");
    revalidatePath("/dashboard/evaluations");
    revalidatePath("/dashboard/pipeline");
    revalidatePath("/dashboard/expert-review");
  } catch {
    // revalidatePath requires a Next.js request context
  }

  return evaluation;
}

export async function getTechnicalEvaluationForApplication(
  applicationId: number,
) {
  if (
    typeof applicationId !== "number" ||
    !Number.isFinite(applicationId) ||
    !Number.isInteger(applicationId) ||
    applicationId <= 0
  ) {
    throw new EvaluationValidationError(
      "Application ID must be a positive integer.",
    );
  }

  const { application, interviewerId } =
    await resolveAssignedInterviewerForApplication(applicationId);

  return getEvaluationForApplication(application.id, interviewerId);
}

function toEvaluationData(evaluationInput: ValidatedEvaluationInput) {
  return {
    ...evaluationInput,
    scorecard:
      evaluationInput.scorecard === null
        ? Prisma.DbNull
        : evaluationInput.scorecard,
  };
}

function translateEvaluationSaveError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new Error("Evaluation already exists.");
    }

    if (error.code === "P2003") {
      return new Error(
        "Cannot modify or delete this evaluation because related records exist.",
      );
    }

    if (error.code === "P2025") {
      return new Error("Evaluation not found.");
    }
  }

  return new Error("Unable to save evaluation.");
}

function translateEvaluationDeleteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003") {
      return new Error(
        "Cannot modify or delete this evaluation because related records exist.",
      );
    }

    if (error.code === "P2025") {
      return new Error("Evaluation not found.");
    }
  }

  return new Error("Unable to delete evaluation.");
}

function translateEvaluationQuestionSaveError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new Error("Evaluation question already exists.");
    }

    if (error.code === "P2003") {
      return new Error(
        "Cannot modify or delete this evaluation question because related records exist.",
      );
    }

    if (error.code === "P2025") {
      return new Error("Evaluation question not found.");
    }
  }

  return new Error("Unable to save evaluation question.");
}

function translateEvaluationQuestionDeleteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003") {
      return new Error(
        "Cannot modify or delete this evaluation question because related records exist.",
      );
    }

    if (error.code === "P2025") {
      return new Error("Evaluation question not found.");
    }
  }

  return new Error("Unable to delete evaluation question.");
}

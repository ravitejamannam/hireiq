"use server";

import {
  AuthorizationError,
  requireAdmin,
  requireApplicationAccess,
  requireInterviewerPortal,
} from "@/lib/auth/authorization";
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
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
  const evaluationQuestionId = validateEvaluationQuestionId(id);
  const existingQuestion = await ensureEvaluationQuestionExists(
    evaluationQuestionId,
  );

  const evaluationQuestionInput = await validateEvaluationQuestionInput(
    evaluationId,
    question,
    fields,
  );

  if (existingQuestion.evaluationId !== evaluationQuestionInput.evaluationId) {
    throw new EvaluationValidationError(
      "Evaluation question does not belong to the specified evaluation.",
    );
  }

  try {
    const question = await prisma.evaluationQuestion.update({
      where: {
        id: evaluationQuestionId,
      },
      data: {
        question: evaluationQuestionInput.question,
        answer: evaluationQuestionInput.answer,
        expertComment: evaluationQuestionInput.expertComment,
        score: evaluationQuestionInput.score,
        difficulty: evaluationQuestionInput.difficulty,
        weight: evaluationQuestionInput.weight,
      },
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
  await requireAdmin();
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
  await requireAdmin();
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
    evaluation = await prisma.evaluation.upsert({
      where: {
        applicationId_interviewerId: {
          applicationId: application.id,
          interviewerId,
        },
      },
      create: toEvaluationData(evaluationInput),
      update: toEvaluationUpdateData(evaluationInput),
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

  await requireApplicationAccess(applicationId);

  const { application, interviewerId } =
    await resolveAssignedInterviewerForApplication(applicationId);

  return getEvaluationForApplication(application.id, interviewerId);
}

async function assertInterviewerOwnsEvaluation(evaluationId: number) {
  const interviewer = await requireInterviewerPortal();

  const evaluation = await prisma.evaluation.findFirst({
    where: {
      id: evaluationId,
      interviewerId: interviewer.interviewerId,
      application: {
        job: {
          assignedInterviewerId: interviewer.interviewerId,
        },
      },
    },
    select: {
      id: true,
      applicationId: true,
      interviewerId: true,
      application: {
        select: {
          jobId: true,
        },
      },
    },
  });

  if (!evaluation) {
    throw new AuthorizationError("Resource not found.");
  }

  return { interviewer, evaluation };
}

async function assertInterviewerOwnsApplication(applicationId: number) {
  const interviewer = await requireInterviewerPortal();

  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      job: {
        assignedInterviewerId: interviewer.interviewerId,
      },
    },
    select: {
      id: true,
      jobId: true,
      status: true,
    },
  });

  if (!application) {
    throw new AuthorizationError("Resource not found.");
  }

  return { interviewer, application };
}

function revalidateInterviewerEvaluationPaths(
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
    revalidatePath("/interviewer/evaluations");
    revalidatePath("/dashboard/evaluations");
    revalidatePath("/dashboard/technical-evaluations");
  } catch {
    // revalidatePath requires a Next.js request context
  }
}

/**
 * Assigned interviewer Hire or No Hire recommendation.
 * Does not change application status or write an OutcomeEvent.
 */
export async function submitInterviewerHiringRecommendation(
  applicationId: number,
  recommendation: "HIRE" | "NO_HIRE",
  reason: unknown,
) {
  const writtenReason = typeof reason === "string" ? reason.trim() : "";
  if (!writtenReason) {
    throw new EvaluationValidationError("A written reason is required.");
  }
  if (recommendation !== "HIRE" && recommendation !== "NO_HIRE") {
    throw new EvaluationValidationError("Recommendation must be Hire or No Hire.");
  }

  const { interviewer, application } =
    await assertInterviewerOwnsApplication(applicationId);

  const evaluation = await prisma.evaluation.upsert({
    where: {
      applicationId_interviewerId: {
        applicationId: application.id,
        interviewerId: interviewer.interviewerId,
      },
    },
    create: {
      applicationId: application.id,
      interviewerId: interviewer.interviewerId,
      recommendation,
      notes: writtenReason,
    },
    update: {
      recommendation,
      notes: writtenReason,
    },
    select: {
      id: true,
      applicationId: true,
      recommendation: true,
      notes: true,
    },
  });

  revalidateInterviewerEvaluationPaths(application.jobId, application.id);
  return evaluation;
}

/**
 * Interviewer upsert of their own Evaluation for an assigned Application.
 * Does not accept interviewerId from the browser.
 */
export async function saveInterviewerEvaluation(
  applicationId: number,
  fields: EvaluationFieldsInput = {},
) {
  const { interviewer, application } =
    await assertInterviewerOwnsApplication(applicationId);

  const evaluationInput = await validateEvaluationInput(
    application.id,
    interviewer.interviewerId,
    fields,
  );

  let evaluation;

  try {
    evaluation = await prisma.evaluation.upsert({
      where: {
        applicationId_interviewerId: {
          applicationId: application.id,
          interviewerId: interviewer.interviewerId,
        },
      },
      create: toEvaluationData(evaluationInput),
      update: toEvaluationUpdateData(evaluationInput),
    });
  } catch (error) {
    if (error instanceof EvaluationValidationError) {
      throw error;
    }

    throw translateEvaluationSaveError(error);
  }

  revalidateInterviewerEvaluationPaths(application.jobId, application.id);

  return evaluation;
}

export async function createInterviewerEvaluationQuestion(
  evaluationId: number,
  question: string,
  fields: EvaluationQuestionFieldsInput = {},
) {
  const { evaluation } = await assertInterviewerOwnsEvaluation(evaluationId);

  const evaluationQuestionInput = await validateEvaluationQuestionInput(
    evaluation.id,
    question,
    fields,
  );

  try {
    const created = await prisma.evaluationQuestion.create({
      data: evaluationQuestionInput,
    });

    revalidateInterviewerEvaluationPaths(
      evaluation.application.jobId,
      evaluation.applicationId,
    );

    return created;
  } catch (error) {
    throw translateEvaluationQuestionSaveError(error);
  }
}

export async function updateInterviewerEvaluationQuestion(
  id: number,
  evaluationId: number,
  question: string,
  fields: EvaluationQuestionFieldsInput = {},
) {
  const { evaluation } = await assertInterviewerOwnsEvaluation(evaluationId);
  const evaluationQuestionId = validateEvaluationQuestionId(id);

  const ownedQuestion = await prisma.evaluationQuestion.findFirst({
    where: {
      id: evaluationQuestionId,
      evaluationId: evaluation.id,
    },
    select: { id: true },
  });

  if (!ownedQuestion) {
    throw new AuthorizationError("Resource not found.");
  }

  const evaluationQuestionInput = await validateEvaluationQuestionInput(
    evaluation.id,
    question,
    fields,
  );

  try {
    const updated = await prisma.evaluationQuestion.update({
      where: {
        id: evaluationQuestionId,
      },
      data: evaluationQuestionInput,
    });

    revalidateInterviewerEvaluationPaths(
      evaluation.application.jobId,
      evaluation.applicationId,
    );

    return updated;
  } catch (error) {
    throw translateEvaluationQuestionSaveError(error);
  }
}

export async function deleteInterviewerEvaluationQuestion(id: number) {
  const interviewer = await requireInterviewerPortal();
  const evaluationQuestionId = validateEvaluationQuestionId(id);

  const ownedQuestion = await prisma.evaluationQuestion.findFirst({
    where: {
      id: evaluationQuestionId,
      evaluation: {
        interviewerId: interviewer.interviewerId,
        application: {
          job: {
            assignedInterviewerId: interviewer.interviewerId,
          },
        },
      },
    },
    select: {
      id: true,
      evaluation: {
        select: {
          applicationId: true,
          application: {
            select: {
              jobId: true,
            },
          },
        },
      },
    },
  });

  if (!ownedQuestion) {
    throw new AuthorizationError("Resource not found.");
  }

  try {
    await prisma.evaluationQuestion.delete({
      where: {
        id: evaluationQuestionId,
      },
    });
  } catch (error) {
    throw translateEvaluationQuestionDeleteError(error);
  }

  revalidateInterviewerEvaluationPaths(
    ownedQuestion.evaluation.application.jobId,
    ownedQuestion.evaluation.applicationId,
  );
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

function toEvaluationUpdateData(evaluationInput: ValidatedEvaluationInput) {
  return {
    overallScore: evaluationInput.overallScore,
    scorecard:
      evaluationInput.scorecard === null
        ? Prisma.DbNull
        : evaluationInput.scorecard,
    notes: evaluationInput.notes,
    recordingUrl: evaluationInput.recordingUrl,
    recommendation: evaluationInput.recommendation,
    hireProbability: evaluationInput.hireProbability,
    fitDecision: evaluationInput.fitDecision,
    evaluatedAt: evaluationInput.evaluatedAt,
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

export async function submitRubricScorecard(input: {
  applicationId: number;
  scores: Array<{ criterion: string; score: number }>;
  notes?: string | null;
}) {
  const interviewer = await requireInterviewerPortal();
  const scores = input.scores.length > 0 ? input.scores : [{ criterion: "Overall", score: Number.NaN }];
  if (scores.some((row) => !Number.isInteger(row.score) || row.score < 1 || row.score > 5)) {
    throw new Error("Score each item from 1 to 5.");
  }
  const application = await prisma.application.findFirst({
    where: { id: input.applicationId, job: { assignedInterviewerId: interviewer.interviewerId } },
    select: { id: true },
  });
  if (!application) throw new AuthorizationError();
  const now = new Date();
  const overall = Math.round(scores.reduce((sum, row) => sum + row.score, 0) / scores.length);
  await prisma.evaluation.upsert({
    where: {
      applicationId_interviewerId: {
        applicationId: application.id,
        interviewerId: interviewer.interviewerId,
      },
    },
    create: {
      applicationId: application.id,
      interviewerId: interviewer.interviewerId,
      overallScore: overall,
      scorecard: scores,
      notes: input.notes?.trim() || null,
      submittedAt: now,
      evaluatedAt: now,
    },
    update: {
      overallScore: overall,
      scorecard: scores,
      notes: input.notes?.trim() || null,
      submittedAt: now,
      evaluatedAt: now,
    },
  });
  revalidatePath(`/interviewer/requirements`);
}

import {
  EvaluationFitDecision,
  Recommendation,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class EvaluationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationValidationError";
  }
}

export type ScorecardEntry = {
  skill: string;
  score: number;
  comment: string | null;
};

export type EvaluationFieldsInput = {
  overallScore?: unknown;
  scorecard?: unknown;
  notes?: unknown;
  recordingUrl?: unknown;
  recommendation?: unknown;
  hireProbability?: unknown;
  fitDecision?: unknown;
  evaluatedAt?: unknown;
};

export type EvaluationQuestionFieldsInput = {
  answer?: unknown;
  expertComment?: unknown;
  score?: unknown;
  difficulty?: unknown;
  weight?: unknown;
};

export type ValidatedEvaluationInput = {
  applicationId: number;
  interviewerId: number;
  overallScore: number | null;
  scorecard: ScorecardEntry[] | null;
  notes: string | null;
  recordingUrl: string | null;
  recommendation: Recommendation | null;
  hireProbability: string | null;
  fitDecision: EvaluationFitDecision | null;
  evaluatedAt: Date | null;
};

export type ValidatedEvaluationQuestionInput = {
  evaluationId: number;
  question: string;
  answer: string | null;
  expertComment: string | null;
  score: number | null;
  difficulty: string | null;
  weight: string | null;
};

export function validateEvaluationId(id: unknown) {
  return validatePositiveInteger(id, "Evaluation ID must be a positive integer.");
}

export function validateEvaluationQuestionId(id: unknown) {
  return validatePositiveInteger(
    id,
    "Evaluation question ID must be a positive integer.",
  );
}

function validateApplicationId(applicationId: unknown) {
  return validatePositiveInteger(
    applicationId,
    "Application ID must be a positive integer.",
  );
}

function validateInterviewerId(interviewerId: unknown) {
  return validatePositiveInteger(
    interviewerId,
    "Interviewer ID must be a positive integer.",
  );
}

function validateQuestionEvaluationId(evaluationId: unknown) {
  return validatePositiveInteger(
    evaluationId,
    "Evaluation ID must be a positive integer.",
  );
}

function validatePositiveInteger(value: unknown, message: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new EvaluationValidationError(message);
  }

  return value;
}

function validateNullableString(value: unknown, message: string) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new EvaluationValidationError(message);
  }

  return value.trim() || null;
}

function validateNullableNonNegativeInteger(value: unknown, message: string) {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new EvaluationValidationError(message);
  }

  return value;
}

function validateRecommendation(recommendation: unknown) {
  if (recommendation === null || recommendation === undefined) {
    return null;
  }

  if (
    typeof recommendation !== "string" ||
    !Object.values(Recommendation).includes(recommendation as Recommendation)
  ) {
    throw new EvaluationValidationError(
      "Evaluation recommendation is invalid.",
    );
  }

  return recommendation as Recommendation;
}

function validateFitDecision(fitDecision: unknown) {
  if (fitDecision === null || fitDecision === undefined) {
    return null;
  }

  if (
    typeof fitDecision !== "string" ||
    !Object.values(EvaluationFitDecision).includes(
      fitDecision as EvaluationFitDecision,
    )
  ) {
    throw new EvaluationValidationError("Evaluation fit decision is invalid.");
  }

  return fitDecision as EvaluationFitDecision;
}

function validateEvaluatedAt(evaluatedAt: unknown) {
  if (evaluatedAt === null || evaluatedAt === undefined) {
    return null;
  }

  if (!(evaluatedAt instanceof Date) || Number.isNaN(evaluatedAt.getTime())) {
    throw new EvaluationValidationError(
      "Evaluation date and time is invalid.",
    );
  }

  return evaluatedAt;
}

function validateQuestion(question: unknown) {
  if (typeof question !== "string" || !question.trim()) {
    throw new EvaluationValidationError("Evaluation question is required.");
  }

  return question.trim();
}

function validateScorecard(scorecard: unknown): ScorecardEntry[] | null {
  if (scorecard === null || scorecard === undefined) {
    return null;
  }

  let value: unknown = scorecard;

  if (typeof scorecard === "string") {
    const trimmed = scorecard.trim();

    if (!trimmed) {
      return null;
    }

    try {
      value = JSON.parse(trimmed);
    } catch {
      throw new EvaluationValidationError("Scorecard is invalid.");
    }
  }

  if (!Array.isArray(value)) {
    throw new EvaluationValidationError(
      "Scorecard must be an array of skill-score objects.",
    );
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new EvaluationValidationError(
        `Scorecard entry ${index + 1} is invalid.`,
      );
    }

    const record = entry as Record<string, unknown>;
    const skill = validateNullableString(
      record.skill,
      "Scorecard skill must be a string or null.",
    );

    if (!skill) {
      throw new EvaluationValidationError(
        `Scorecard entry ${index + 1} requires a skill name.`,
      );
    }

    const score = validateNullableNonNegativeInteger(
      record.score,
      "Scorecard score must be a non-negative integer.",
    );

    if (score === null) {
      throw new EvaluationValidationError(
        `Scorecard entry ${index + 1} requires a score.`,
      );
    }

    const comment =
      record.comment === undefined
        ? null
        : validateNullableString(
            record.comment,
            "Scorecard comment must be a string or null.",
          );

    return {
      skill,
      score,
      comment,
    };
  });
}

export async function ensureEvaluationExists(id: number) {
  const evaluation = await prisma.evaluation.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (!evaluation) {
    throw new EvaluationValidationError("Evaluation not found.");
  }

  return evaluation;
}

export async function ensureEvaluationQuestionExists(id: number) {
  const evaluationQuestion = await prisma.evaluationQuestion.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (!evaluationQuestion) {
    throw new EvaluationValidationError("Evaluation question not found.");
  }

  return evaluationQuestion;
}

async function ensureApplicationExists(id: number) {
  const application = await prisma.application.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (!application) {
    throw new EvaluationValidationError("Application not found.");
  }

  return application;
}

async function ensureInterviewerExists(id: number) {
  const interviewer = await prisma.interviewer.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (!interviewer) {
    throw new EvaluationValidationError("Interviewer not found.");
  }

  return interviewer;
}

export async function resolveAssignedInterviewerForApplication(
  applicationId: number,
) {
  const application = await prisma.application.findUnique({
    where: {
      id: applicationId,
    },
    select: {
      id: true,
      status: true,
      candidate: {
        select: {
          companyId: true,
        },
      },
      job: {
        select: {
          id: true,
          companyId: true,
          assignedInterviewerId: true,
        },
      },
    },
  });

  if (!application) {
    throw new EvaluationValidationError("Application not found.");
  }

  if (!application.job) {
    throw new EvaluationValidationError("Job not found.");
  }

  if (application.candidate.companyId !== application.job.companyId) {
    throw new EvaluationValidationError(
      "Candidate and job must belong to the same company.",
    );
  }

  if (!application.job.assignedInterviewerId) {
    throw new EvaluationValidationError(
      "Interviewer must be assigned before technical evaluation.",
    );
  }

  await ensureInterviewerExists(application.job.assignedInterviewerId);

  return {
    application,
    interviewerId: application.job.assignedInterviewerId,
  };
}

export async function validateEvaluationInput(
  applicationId: unknown,
  interviewerId: unknown,
  fields: EvaluationFieldsInput = {},
): Promise<ValidatedEvaluationInput> {
  const validatedApplicationId = validateApplicationId(applicationId);
  const validatedInterviewerId = validateInterviewerId(interviewerId);

  await Promise.all([
    ensureApplicationExists(validatedApplicationId),
    ensureInterviewerExists(validatedInterviewerId),
  ]);

  return {
    applicationId: validatedApplicationId,
    interviewerId: validatedInterviewerId,
    overallScore: validateNullableNonNegativeInteger(
      fields.overallScore,
      "Overall score must be a non-negative integer.",
    ),
    scorecard: validateScorecard(fields.scorecard),
    notes: validateNullableString(
      fields.notes,
      "Evaluation notes must be a string or null.",
    ),
    recordingUrl: validateNullableString(
      fields.recordingUrl,
      "Recording URL must be a string or null.",
    ),
    recommendation: validateRecommendation(fields.recommendation),
    hireProbability: validateNullableString(
      fields.hireProbability,
      "Hire probability must be a string or null.",
    ),
    fitDecision: validateFitDecision(fields.fitDecision),
    evaluatedAt: validateEvaluatedAt(fields.evaluatedAt),
  };
}

export async function validateEvaluationQuestionInput(
  evaluationId: unknown,
  question: unknown,
  fields: EvaluationQuestionFieldsInput = {},
): Promise<ValidatedEvaluationQuestionInput> {
  const validatedEvaluationId = validateQuestionEvaluationId(evaluationId);

  await ensureEvaluationExists(validatedEvaluationId);

  return {
    evaluationId: validatedEvaluationId,
    question: validateQuestion(question),
    answer: validateNullableString(
      fields.answer,
      "Evaluation answer must be a string or null.",
    ),
    expertComment: validateNullableString(
      fields.expertComment,
      "Expert comment must be a string or null.",
    ),
    score: validateNullableNonNegativeInteger(
      fields.score,
      "Question score must be a non-negative integer.",
    ),
    difficulty: validateNullableString(
      fields.difficulty,
      "Difficulty must be a string or null.",
    ),
    weight: validateNullableString(fields.weight, "Weight must be a string or null."),
  };
}

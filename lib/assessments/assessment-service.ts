import {
  AssessmentAttemptStatus,
  Prisma,
  RoleCategory,
} from "@prisma/client";

import {
  ASSESSMENT_ALREADY_SUBMITTED,
  ASSESSMENT_ANSWERS_REQUIRED,
  ASSESSMENT_BANK_EMPTY,
  ASSESSMENT_UNAVAILABLE,
  ASSESSMENT_WINDOW_CLOSED,
  AssessmentError,
  AssessmentValidationError,
} from "@/lib/assessments/assessment-errors";
import {
  ASSESSMENT_BANK_QUESTIONS,
  ASSESSMENT_WINDOW_HOURS,
} from "@/lib/assessments/assessment-bank";
import {
  buildAssessmentUrl,
  mintAssessmentInviteToken,
} from "@/lib/assessments/assessment-token";
import {
  isTerminalAttemptStatus,
  validateAssessmentAnswers,
  validatePublicAssessmentToken,
  validateIntegritySignals,
} from "@/lib/assessments/assessment-validation";
import { hashSecureToken } from "@/lib/auth/secure-token";
import { prisma } from "@/lib/prisma";
import { getPrismaErrorCode } from "@/lib/prisma-error";

type Db = Prisma.TransactionClient | typeof prisma;

type ScoringKey = Record<string, { correctIndex: number; weight: number }>;

export type PublicAssessmentQuestion = {
  id: number;
  prompt: string;
  choices: string[];
};

export type PublicAssessmentPage = {
  title: string;
  companyDisplayName: string;
  expiresAt: string;
  status: AssessmentAttemptStatus;
  questions: PublicAssessmentQuestion[];
  score: number | null;
  maxScore: number | null;
  submittedAt: string | null;
};

export type AssessmentLeaderboardRow = {
  rank: number;
  name: string;
  score: number;
  maxScore: number;
  submittedAt: string;
};

export type AssessmentLeaderboardPage = {
  title: string;
  companyDisplayName: string;
  rows: AssessmentLeaderboardRow[];
};

function parseChoices(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function parseScoringKey(value: unknown): ScoringKey {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const key: ScoringKey = {};
  for (const [questionId, entry] of Object.entries(record)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const row = entry as Record<string, unknown>;
    if (
      typeof row.correctIndex !== "number" ||
      typeof row.weight !== "number"
    ) {
      continue;
    }
    key[questionId] = {
      correctIndex: row.correctIndex,
      weight: row.weight,
    };
  }
  return key;
}

function windowMs() {
  return ASSESSMENT_WINDOW_HOURS * 60 * 60 * 1000;
}

async function loadQuestionsForCategory(
  roleCategory: RoleCategory,
  db: Db,
  options: { incrementUsage?: boolean } = {},
) {
  // T102 leakage control: only active questions, ordered least-used first
  // so exposure spreads across the bank instead of burning the same items.
  const questions = await db.assessmentBankQuestion.findMany({
    where: { roleCategory, active: true },
    orderBy: [{ timesUsed: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      prompt: true,
      choices: true,
      correctIndex: true,
      weight: true,
    },
  });

  if (questions.length === 0) {
    throw new AssessmentError(ASSESSMENT_BANK_EMPTY, "UNAVAILABLE");
  }

  if (options.incrementUsage && questions.length > 0) {
    await db.assessmentBankQuestion.updateMany({
      where: { id: { in: questions.map((question) => question.id) } },
      data: { timesUsed: { increment: 1 } },
    });
  }

  return questions;
}

export async function upsertAssessmentBank(db: Db = prisma) {
  for (const question of ASSESSMENT_BANK_QUESTIONS) {
    await db.assessmentBankQuestion.upsert({
      where: {
        roleCategory_sortOrder: {
          roleCategory: question.roleCategory,
          sortOrder: question.sortOrder,
        },
      },
      create: {
        roleCategory: question.roleCategory,
        sortOrder: question.sortOrder,
        prompt: question.prompt,
        choices: question.choices,
        correctIndex: question.correctIndex,
        weight: question.weight,
        skillTag: question.skillTag,
      },
      update: {
        prompt: question.prompt,
        choices: question.choices,
        correctIndex: question.correctIndex,
        weight: question.weight,
        skillTag: question.skillTag,
      },
    });
  }
}

export async function mintAssessmentInviteForApplication(
  applicationId: number,
  db: Db = prisma,
) {
  const application = await db.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      job: {
        select: {
          roleCategory: true,
          currentPublishedSpecificationVersion: {
            select: { roleCategory: true },
          },
        },
      },
    },
  });

  if (!application) {
    throw new AssessmentError(ASSESSMENT_UNAVAILABLE, "UNAVAILABLE");
  }

  const roleCategory =
    application.job.currentPublishedSpecificationVersion?.roleCategory ??
    application.job.roleCategory;

  if (!roleCategory) {
    return null;
  }

  const existing = await db.assessmentInvite.findUnique({
    where: { applicationId: application.id },
    select: { id: true, tokenHash: true, revokedAt: true },
  });

  const minted = mintAssessmentInviteToken(application.id);
  const assessmentUrl = buildAssessmentUrl(minted.rawToken);

  if (existing && !existing.revokedAt) {
    if (existing.tokenHash !== minted.tokenHash) {
      await db.assessmentInvite.update({
        where: { id: existing.id },
        data: { tokenHash: minted.tokenHash },
      });
    }
    return { assessmentUrl };
  }

  const questions = await loadQuestionsForCategory(roleCategory, db, {
    incrementUsage: true,
  });
  const scoringKey: ScoringKey = {};
  for (const question of questions) {
    scoringKey[String(question.id)] = {
      correctIndex: question.correctIndex,
      weight: question.weight,
    };
  }

  const maxScore = questions.reduce((sum, question) => sum + question.weight, 0);
  const now = new Date();

  try {
    await db.assessmentInvite.create({
      data: {
        applicationId: application.id,
        tokenHash: minted.tokenHash,
        roleCategory,
        questionIds: questions.map((question) => question.id),
        scoringKey,
        expiresAt: new Date(now.getTime() + windowMs()),
        attempt: {
          create: {
            status: AssessmentAttemptStatus.PENDING,
            score: 0,
            maxScore,
          },
        },
      },
    });
  } catch (error) {
    if (
      getPrismaErrorCode(error) === "P2002"
    ) {
      return { assessmentUrl };
    }
    throw error;
  }

  return { assessmentUrl };
}

async function loadInviteByRawToken(rawToken: string) {
  const tokenHash = hashSecureToken(rawToken);
  const invite = await prisma.assessmentInvite.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      applicationId: true,
      roleCategory: true,
      questionIds: true,
      scoringKey: true,
      expiresAt: true,
      startedAt: true,
      submittedAt: true,
      revokedAt: true,
      application: {
        select: {
          candidate: { select: { name: true } },
          job: {
            select: {
              title: true,
              company: { select: { name: true } },
            },
          },
        },
      },
      attempt: {
        select: {
          id: true,
          status: true,
          score: true,
          maxScore: true,
          submittedAt: true,
        },
      },
    },
  });

  if (!invite || invite.revokedAt || !invite.attempt) {
    throw new AssessmentError(ASSESSMENT_UNAVAILABLE, "UNAVAILABLE");
  }

  return { ...invite, attempt: invite.attempt };
}

async function expireIfNeeded(
  invite: Awaited<ReturnType<typeof loadInviteByRawToken>>,
) {
  const now = new Date();
  if (
    now.getTime() > invite.expiresAt.getTime() &&
    !isTerminalAttemptStatus(invite.attempt.status)
  ) {
    await prisma.$transaction([
      prisma.assessmentInvite.update({
        where: { id: invite.id },
        data: { submittedAt: invite.submittedAt },
      }),
      prisma.assessmentAttempt.update({
        where: { id: invite.attempt.id },
        data: { status: AssessmentAttemptStatus.EXPIRED },
      }),
    ]);
    invite.attempt.status = AssessmentAttemptStatus.EXPIRED;
  }
  return invite;
}

export async function resolvePublicAssessment(rawToken: unknown) {
  const parsed = validatePublicAssessmentToken(rawToken);
  if (!parsed) {
    throw new AssessmentError(ASSESSMENT_UNAVAILABLE, "UNAVAILABLE");
  }

  const invite = await expireIfNeeded(await loadInviteByRawToken(parsed));

  if (invite.attempt.status === AssessmentAttemptStatus.EXPIRED) {
    throw new AssessmentError(ASSESSMENT_WINDOW_CLOSED, "EXPIRED");
  }

  if (
    invite.attempt.status === AssessmentAttemptStatus.PENDING &&
    !invite.startedAt
  ) {
    const now = new Date();
    await prisma.$transaction([
      prisma.assessmentInvite.update({
        where: { id: invite.id },
        data: { startedAt: now },
      }),
      prisma.assessmentAttempt.update({
        where: { id: invite.attempt.id },
        data: {
          status: AssessmentAttemptStatus.IN_PROGRESS,
          startedAt: now,
        },
      }),
    ]);
    invite.startedAt = now;
    invite.attempt.status = AssessmentAttemptStatus.IN_PROGRESS;
  }

  const questions = await prisma.assessmentBankQuestion.findMany({
    where: { id: { in: invite.questionIds } },
    select: { id: true, prompt: true, choices: true },
  });
  const byId = new Map(questions.map((question) => [question.id, question]));
  const ordered = invite.questionIds
    .map((id) => byId.get(id))
    .filter((question): question is NonNullable<typeof question> =>
      Boolean(question),
    );

  return {
    title: invite.application.job.title,
    companyDisplayName: invite.application.job.company.name,
    expiresAt: invite.expiresAt.toISOString(),
    status: invite.attempt.status,
    questions: ordered.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      choices: parseChoices(question.choices),
    })),
    score:
      invite.attempt.status === AssessmentAttemptStatus.COMPLETED
        ? invite.attempt.score
        : null,
    maxScore:
      invite.attempt.status === AssessmentAttemptStatus.COMPLETED
        ? invite.attempt.maxScore
        : null,
    submittedAt: invite.attempt.submittedAt
      ? invite.attempt.submittedAt.toISOString()
      : null,
  } satisfies PublicAssessmentPage;
}

export async function submitPublicAssessment(input: {
  token: unknown;
  answers: unknown;
  integrity?: unknown;
}) {
  const parsed = validatePublicAssessmentToken(input.token);
  if (!parsed) {
    throw new AssessmentError(ASSESSMENT_UNAVAILABLE, "UNAVAILABLE");
  }

  const invite = await expireIfNeeded(await loadInviteByRawToken(parsed));

  if (invite.attempt.status === AssessmentAttemptStatus.EXPIRED) {
    throw new AssessmentError(ASSESSMENT_WINDOW_CLOSED, "EXPIRED");
  }

  if (invite.attempt.status === AssessmentAttemptStatus.COMPLETED) {
    throw new AssessmentError(ASSESSMENT_ALREADY_SUBMITTED, "SUBMITTED");
  }

  const selected = validateAssessmentAnswers(invite.questionIds, input.answers);
  const integritySignals = validateIntegritySignals(input.integrity);
  const scoringKey = parseScoringKey(invite.scoringKey);
  const questions = await prisma.assessmentBankQuestion.findMany({
    where: { id: { in: invite.questionIds } },
    select: { id: true, choices: true },
  });
  const byId = new Map(questions.map((question) => [question.id, question]));

  let score = 0;
  const rows: Array<{
    questionId: number;
    selectedIndex: number;
    isCorrect: boolean;
    weight: number;
  }> = [];

  for (const questionId of invite.questionIds) {
    const question = byId.get(questionId);
    const key = scoringKey[String(questionId)];
    if (!question || !key) {
      throw new AssessmentError(ASSESSMENT_UNAVAILABLE, "UNAVAILABLE");
    }
    const choices = parseChoices(question.choices);
    const selectedIndex = selected[questionId];
    if (selectedIndex >= choices.length) {
      throw new AssessmentValidationError({
        form: ASSESSMENT_ANSWERS_REQUIRED,
      });
    }
    const isCorrect = selectedIndex === key.correctIndex;
    if (isCorrect) {
      score += key.weight;
    }
    rows.push({
      questionId,
      selectedIndex,
      isCorrect,
      weight: key.weight,
    });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.assessmentAnswer.deleteMany({
      where: { attemptId: invite.attempt.id },
    });
    await tx.assessmentAnswer.createMany({
      data: rows.map((row) => ({
        attemptId: invite.attempt.id,
        questionId: row.questionId,
        selectedIndex: row.selectedIndex,
        isCorrect: row.isCorrect,
        weight: row.weight,
      })),
    });
    await tx.assessmentAttempt.update({
      where: { id: invite.attempt.id },
      data: {
        status: AssessmentAttemptStatus.COMPLETED,
        score,
        submittedAt: now,
        startedAt: invite.startedAt ?? now,
        integritySignals: integritySignals ?? undefined,
      },
    });
    await tx.assessmentInvite.update({
      where: { id: invite.id },
      data: {
        startedAt: invite.startedAt ?? now,
        submittedAt: now,
      },
    });
  });

  return {
    success: true as const,
    score,
    maxScore: invite.attempt.maxScore,
  };
}

export async function getAssessmentLeaderboardForJob(jobId: number) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      title: true,
      company: { select: { name: true } },
    },
  });

  if (!job) {
    throw new AssessmentError(ASSESSMENT_UNAVAILABLE, "UNAVAILABLE");
  }

  const attempts = await prisma.assessmentAttempt.findMany({
    where: {
      status: AssessmentAttemptStatus.COMPLETED,
      invite: {
        application: { jobId },
        revokedAt: null,
      },
    },
    select: {
      score: true,
      maxScore: true,
      submittedAt: true,
      invite: {
        select: {
          application: {
            select: {
              candidate: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ score: "desc" }, { submittedAt: "asc" }],
  });

  const rows: AssessmentLeaderboardRow[] = attempts
    .filter((attempt) => attempt.submittedAt)
    .map((attempt, index) => ({
      rank: index + 1,
      name: attempt.invite.application.candidate.name,
      score: attempt.score,
      maxScore: attempt.maxScore,
      submittedAt: attempt.submittedAt!.toISOString(),
    }));

  return {
    title: job.title,
    companyDisplayName: job.company.name,
    rows,
  } satisfies AssessmentLeaderboardPage;
}

export async function getAssessmentLeaderboardForInviteToken(rawToken: unknown) {
  const parsed = validatePublicAssessmentToken(rawToken);
  if (!parsed) {
    throw new AssessmentError(ASSESSMENT_UNAVAILABLE, "UNAVAILABLE");
  }

  const invite = await prisma.assessmentInvite.findUnique({
    where: { tokenHash: hashSecureToken(parsed) },
    select: {
      revokedAt: true,
      application: { select: { jobId: true } },
    },
  });

  if (!invite || invite.revokedAt) {
    throw new AssessmentError(ASSESSMENT_UNAVAILABLE, "UNAVAILABLE");
  }

  return getAssessmentLeaderboardForJob(invite.application.jobId);
}

export async function getAssessmentLeaderboardForApplyToken(rawToken: unknown) {
  const parsed = validatePublicAssessmentToken(rawToken);
  if (!parsed) {
    throw new AssessmentError(ASSESSMENT_UNAVAILABLE, "UNAVAILABLE");
  }

  const applyToken = await prisma.applyToken.findUnique({
    where: { tokenHash: hashSecureToken(parsed) },
    select: {
      revokedAt: true,
      distribution: {
        select: { jobId: true },
      },
    },
  });

  if (!applyToken || applyToken.revokedAt) {
    throw new AssessmentError(ASSESSMENT_UNAVAILABLE, "UNAVAILABLE");
  }

  return getAssessmentLeaderboardForJob(applyToken.distribution.jobId);
}

export async function getApplicationAssessmentSummary(applicationId: number) {
  const invite = await prisma.assessmentInvite.findUnique({
    where: { applicationId },
    select: {
      expiresAt: true,
      attempt: {
        select: {
          status: true,
          score: true,
          maxScore: true,
          submittedAt: true,
        },
      },
    },
  });

  if (!invite || !invite.attempt) {
    return null;
  }

  return {
    status: invite.attempt.status,
    score: invite.attempt.score,
    maxScore: invite.attempt.maxScore,
    expiresAt: invite.expiresAt.toISOString(),
    submittedAt: invite.attempt.submittedAt
      ? invite.attempt.submittedAt.toISOString()
      : null,
  };
}

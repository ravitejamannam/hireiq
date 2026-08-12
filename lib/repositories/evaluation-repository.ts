import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

import {
  evaluationScopeWhere,
  requireApplicationAccess,
  requireUser,
} from "@/lib/auth/authorization";

const evaluationSelect = {
  id: true,
  overallScore: true,
  scorecard: true,
  notes: true,
  recordingUrl: true,
  recommendation: true,
  hireProbability: true,
  fitDecision: true,
  evaluatedAt: true,
  createdAt: true,
  updatedAt: true,
  applicationId: true,
  interviewerId: true,
  application: {
    select: {
      id: true,
      status: true,
      candidateId: true,
      jobId: true,
      candidate: {
        select: {
          id: true,
          name: true,
          role: true,
          experienceYears: true,
          location: true,
          currentEmployer: true,
          skills: true,
          expectedCTC: true,
          companyId: true,
        },
      },
      job: {
        select: {
          id: true,
          title: true,
          status: true,
          companyId: true,
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
  interviewer: {
    select: {
      id: true,
      name: true,
      category: true,
      availability: true,
    },
  },
  questions: {
    select: {
      id: true,
      question: true,
      answer: true,
      expertComment: true,
      score: true,
      difficulty: true,
      weight: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  },
} satisfies Prisma.EvaluationSelect;

export async function getEvaluations() {
  const user = await requireUser();

  return prisma.evaluation.findMany({
    where: evaluationScopeWhere(user),
    select: evaluationSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getEvaluationById(id: number) {
  const user = await requireUser();

  return prisma.evaluation.findFirst({
    where: {
      id,
      ...evaluationScopeWhere(user),
    },
    select: evaluationSelect,
  });
}

export async function getEvaluationForApplication(
  applicationId: number,
  interviewerId: number,
) {
  await requireApplicationAccess(applicationId);

  return prisma.evaluation.findFirst({
    where: {
      applicationId,
      interviewerId,
    },
    select: evaluationSelect,
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function getEvaluationsByJobId(jobId: number) {
  const user = await requireUser();

  return prisma.evaluation.findMany({
    where: {
      AND: [
        evaluationScopeWhere(user),
        {
          application: {
            jobId,
          },
        },
      ],
    },
    select: evaluationSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

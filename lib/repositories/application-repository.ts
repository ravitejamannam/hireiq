import { prisma } from "@/lib/prisma";
import type { ApplicationPipelineStatus, Prisma } from "@prisma/client";

import {
  applicationScopeWhere,
  requireUser,
} from "@/lib/auth/authorization";

const applicationSelect = {
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  candidateId: true,
  jobId: true,
  source: true,
  expertScore: true,
  rejectionReason: true,
  candidate: {
    select: {
      id: true,
      name: true,
      role: true,
      experienceYears: true,
      status: true,
      location: true,
      currentEmployer: true,
      skills: true,
      expectedCTC: true,
      companyId: true,
      company: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  job: {
    select: {
      id: true,
      title: true,
      status: true,
      companyId: true,
      assignedInterviewerId: true,
      company: {
        select: {
          id: true,
          name: true,
        },
      },
      assignedInterviewer: {
        select: {
          id: true,
          name: true,
          category: true,
          availability: true,
        },
      },
    },
  },
  evaluations: {
    select: {
      id: true,
      notes: true,
      interviewerId: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc" as const,
    },
  },
} satisfies Prisma.ApplicationSelect;

export async function getApplications() {
  const user = await requireUser();

  return prisma.application.findMany({
    where: applicationScopeWhere(user),
    select: applicationSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getApplicationById(id: number) {
  const user = await requireUser();

  return prisma.application.findFirst({
    where: {
      id,
      ...applicationScopeWhere(user),
    },
    select: applicationSelect,
  });
}

export async function getApplicationsByJobId(jobId: number) {
  const user = await requireUser();

  return prisma.application.findMany({
    where: {
      AND: [
        { jobId },
        applicationScopeWhere(user),
      ],
    },
    select: applicationSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getApplicationsByStatuses(
  statuses: ApplicationPipelineStatus[],
) {
  const user = await requireUser();

  return prisma.application.findMany({
    where: {
      AND: [
        applicationScopeWhere(user),
        {
          status: {
            in: statuses,
          },
        },
      ],
    },
    select: applicationSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getExpertReviewApplications() {
  return getApplicationsByStatuses([
    "CV_POOL",
    "EXPERT_REVIEW",
  ] as ApplicationPipelineStatus[]);
}

export async function getTechnicalEvaluationApplications() {
  const user = await requireUser();

  return prisma.application.findMany({
    where: {
      AND: [
        applicationScopeWhere(user),
        {
          status: {
            in: ["EXPERT_REVIEW", "TECH_EVALUATION"],
          },
        },
      ],
    },
    select: {
      ...applicationSelect,
      evaluations: {
        select: {
          id: true,
          overallScore: true,
          recommendation: true,
          hireProbability: true,
          fitDecision: true,
          evaluatedAt: true,
          notes: true,
          interviewerId: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "asc" as const,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getShortlistApplications() {
  const user = await requireUser();

  return prisma.application.findMany({
    where: {
      AND: [
        applicationScopeWhere(user),
        {
          status: {
            in: ["TECH_EVALUATION", "SHORTLISTED"],
          },
        },
      ],
    },
    select: {
      ...applicationSelect,
      job: {
        select: {
          ...applicationSelect.job.select,
          shortlistingCompletedAt: true,
        },
      },
      evaluations: {
        select: {
          id: true,
          overallScore: true,
          recommendation: true,
          hireProbability: true,
          fitDecision: true,
          evaluatedAt: true,
          notes: true,
          recordingUrl: true,
          interviewerId: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "asc" as const,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

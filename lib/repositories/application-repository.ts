import { prisma } from "@/lib/prisma";
import type { ApplicationPipelineStatus, Prisma } from "@prisma/client";

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
  return prisma.application.findMany({
    select: applicationSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getApplicationById(id: number) {
  return prisma.application.findUnique({
    where: {
      id,
    },
    select: applicationSelect,
  });
}

export async function getApplicationsByJobId(jobId: number) {
  return prisma.application.findMany({
    where: {
      jobId,
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
  return prisma.application.findMany({
    where: {
      status: {
        in: statuses,
      },
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
  return prisma.application.findMany({
    where: {
      status: {
        in: ["EXPERT_REVIEW", "TECH_EVALUATION"],
      },
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

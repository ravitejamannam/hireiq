import { prisma } from "@/lib/prisma";
import type { ApplicationPipelineStatus, Prisma } from "@prisma/client";

import {
  applicationScopeWhere,
  requireClientPortal,
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

const clientApplicationEvaluationSelect = {
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
  interviewerId: true,
} satisfies Prisma.EvaluationSelect;

const clientApplicationListSelect = {
  id: true,
  status: true,
  source: true,
  expertScore: true,
  createdAt: true,
  candidate: {
    select: {
      name: true,
      role: true,
      experienceYears: true,
      location: true,
      currentEmployer: true,
      skills: true,
      expectedCTC: true,
    },
  },
  evaluations: {
    select: clientApplicationEvaluationSelect,
    orderBy: {
      createdAt: "desc" as const,
    },
  },
} satisfies Prisma.ApplicationSelect;

const clientApplicationDetailSelect = {
  id: true,
  status: true,
  source: true,
  expertScore: true,
  createdAt: true,
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
    },
  },
  job: {
    select: {
      id: true,
      title: true,
      status: true,
      company: {
        select: {
          name: true,
        },
      },
    },
  },
  evaluations: {
    select: {
      ...clientApplicationEvaluationSelect,
      questions: {
        select: {
          question: true,
          answer: true,
          expertComment: true,
          score: true,
          difficulty: true,
          weight: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "asc" as const,
        },
      },
    },
    orderBy: {
      createdAt: "desc" as const,
    },
  },
  interviews: {
    select: {
      id: true,
      type: true,
      interviewAt: true,
      result: true,
    },
    orderBy: {
      interviewAt: "desc" as const,
    },
  },
  codingTests: {
    select: {
      id: true,
      title: true,
      score: true,
      maxScore: true,
      status: true,
      takenAt: true,
    },
    orderBy: {
      takenAt: "desc" as const,
    },
  },
} satisfies Prisma.ApplicationSelect;

/**
 * Client portal: applications for a requirement owned by the Client's company.
 * Company boundary comes from the authenticated User, never from query params.
 */
export async function getClientApplicationsForRequirement(
  requirementId: number,
) {
  const client = await requireClientPortal();

  return prisma.application.findMany({
    where: {
      jobId: requirementId,
      job: {
        companyId: client.companyId,
      },
    },
    select: clientApplicationListSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Client portal: one application scoped to Requirement → Job.companyId === User.companyId.
 * Returns null when the application is missing or outside the Client tenant boundary.
 */
export async function getClientApplicationForRequirement(
  requirementId: number,
  applicationId: number,
) {
  const client = await requireClientPortal();

  return prisma.application.findFirst({
    where: {
      id: applicationId,
      jobId: requirementId,
      job: {
        companyId: client.companyId,
      },
    },
    select: clientApplicationDetailSelect,
  });
}

const clientShortlistSelect = {
  id: true,
  status: true,
  source: true,
  expertScore: true,
  createdAt: true,
  updatedAt: true,
  candidate: {
    select: {
      name: true,
      role: true,
      experienceYears: true,
      location: true,
      currentEmployer: true,
      skills: true,
      expectedCTC: true,
    },
  },
  job: {
    select: {
      title: true,
      company: {
        select: {
          name: true,
        },
      },
      assignedInterviewer: {
        select: {
          name: true,
        },
      },
    },
  },
  evaluations: {
    select: {
      ...clientApplicationEvaluationSelect,
      questions: {
        select: {
          question: true,
          answer: true,
          expertComment: true,
          score: true,
          difficulty: true,
          weight: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "asc" as const,
        },
      },
    },
    orderBy: {
      createdAt: "desc" as const,
    },
  },
} satisfies Prisma.ApplicationSelect;

/**
 * Client portal shortlist: SHORTLISTED, SELECTED, and HIRED applications
 * for a company-owned requirement.
 * Authorization: CLIENT → User.companyId → Job.companyId → Application.jobId.
 */
export async function getClientShortlistedApplicationsForRequirement(
  requirementId: number,
) {
  const client = await requireClientPortal();

  return prisma.application.findMany({
    where: {
      jobId: requirementId,
      status: {
        in: ["SHORTLISTED", "SELECTED", "HIRED"],
      },
      job: {
        companyId: client.companyId,
      },
    },
    select: clientShortlistSelect,
    orderBy: [
      {
        updatedAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });
}

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

import { requireInterviewerPortal } from "@/lib/auth/authorization";

function interviewerJobSelect(interviewerId: number) {
  return {
    id: true,
    title: true,
    status: true,
    roleCategory: true,
    experienceRange: true,
    location: true,
    compensationRange: true,
    targetHireDate: true,
    numberOfPositions: true,
    mustHaveRequirements: true,
    niceToHaveRequirements: true,
    jobDescription: true,
    evaluationCriteria: true,
    primarySkills: true,
    requirementLifecycle: true,
    company: {
      select: {
        name: true,
      },
    },
    _count: {
      select: {
        applications: true,
      },
    },
    applications: {
      select: {
        id: true,
        status: true,
        evaluations: {
          where: {
            interviewerId,
          },
          select: {
            id: true,
            evaluatedAt: true,
            interviewerId: true,
          },
        },
      },
    },
  } satisfies Prisma.JobSelect;
}

function interviewerApplicationSelect(interviewerId: number) {
  return {
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
        id: true,
        title: true,
        status: true,
        roleCategory: true,
        location: true,
        experienceRange: true,
        company: {
          select: {
            name: true,
          },
        },
      },
    },
    evaluations: {
      where: {
        interviewerId,
      },
      select: {
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
          },
          orderBy: {
            createdAt: "asc" as const,
          },
        },
      },
      orderBy: {
        createdAt: "asc" as const,
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
  } satisfies Prisma.ApplicationSelect;
}

export async function getInterviewerDashboardStats() {
  const interviewer = await requireInterviewerPortal();

  const jobs = await prisma.job.findMany({
    where: {
      assignedInterviewerId: interviewer.interviewerId,
    },
    select: {
      id: true,
      applications: {
        select: {
          id: true,
          status: true,
          evaluations: {
            where: {
              interviewerId: interviewer.interviewerId,
            },
            select: {
              id: true,
              evaluatedAt: true,
            },
          },
        },
      },
    },
  });

  let candidatesToReview = 0;
  let evaluationsInProgress = 0;
  let evaluationsCompleted = 0;

  for (const job of jobs) {
    for (const application of job.applications) {
      const ownEvaluation = application.evaluations[0] ?? null;
      if (!ownEvaluation) {
        candidatesToReview += 1;
        continue;
      }

      if (ownEvaluation.evaluatedAt) {
        evaluationsCompleted += 1;
      } else {
        evaluationsInProgress += 1;
      }
    }
  }

  return {
    assignedRequirements: jobs.length,
    candidatesToReview,
    evaluationsInProgress,
    evaluationsCompleted,
    requirements: await getInterviewerAssignedJobs(),
  };
}

export async function getInterviewerAssignedJobs() {
  const interviewer = await requireInterviewerPortal();

  return prisma.job.findMany({
    where: {
      assignedInterviewerId: interviewer.interviewerId,
    },
    select: interviewerJobSelect(interviewer.interviewerId),
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getInterviewerAssignedJobById(jobId: number) {
  const interviewer = await requireInterviewerPortal();

  return prisma.job.findFirst({
    where: {
      id: jobId,
      assignedInterviewerId: interviewer.interviewerId,
    },
    select: interviewerJobSelect(interviewer.interviewerId),
  });
}

export async function getInterviewerApplicationsForJob(jobId: number) {
  const interviewer = await requireInterviewerPortal();

  return prisma.application.findMany({
    where: {
      jobId,
      job: {
        assignedInterviewerId: interviewer.interviewerId,
      },
    },
    select: interviewerApplicationSelect(interviewer.interviewerId),
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getInterviewerApplicationForJob(
  jobId: number,
  applicationId: number,
) {
  const interviewer = await requireInterviewerPortal();

  return prisma.application.findFirst({
    where: {
      id: applicationId,
      jobId,
      job: {
        assignedInterviewerId: interviewer.interviewerId,
      },
    },
    select: interviewerApplicationSelect(interviewer.interviewerId),
  });
}

export async function getInterviewerApplications() {
  const interviewer = await requireInterviewerPortal();

  return prisma.application.findMany({
    where: {
      job: {
        assignedInterviewerId: interviewer.interviewerId,
      },
    },
    select: interviewerApplicationSelect(interviewer.interviewerId),
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getInterviewerEvaluations() {
  const interviewer = await requireInterviewerPortal();

  return prisma.evaluation.findMany({
    where: {
      interviewerId: interviewer.interviewerId,
      application: {
        job: {
          assignedInterviewerId: interviewer.interviewerId,
        },
      },
    },
    select: {
      id: true,
      overallScore: true,
      recommendation: true,
      hireProbability: true,
      fitDecision: true,
      evaluatedAt: true,
      createdAt: true,
      application: {
        select: {
          id: true,
          status: true,
          candidate: {
            select: {
              name: true,
              role: true,
            },
          },
          job: {
            select: {
              id: true,
              title: true,
              company: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

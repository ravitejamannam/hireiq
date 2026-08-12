import { prisma } from "@/lib/prisma";
import { ApplicationPipelineStatus, JobStatus } from "@prisma/client";

import {
  applicationScopeWhere,
  AuthorizationError,
  jobScopeWhere,
  requireUser,
} from "@/lib/auth/authorization";

export async function getDashboardStats() {
  const user = await requireUser();
  const now = new Date();
  const jobScope = jobScopeWhere(user);
  const applicationScope = applicationScopeWhere(user);

  const [
    companies,
    candidates,
    interviews,
    codingTests,
    activeRequirements,
    pipelineCandidates,
    shortlisted,
    selected,
    slaAtRisk,
    openRequirements,
  ] = await Promise.all([
    user.role === "ADMIN"
      ? prisma.company.count()
      : user.role === "CLIENT" && user.companyId !== null
        ? prisma.company.count({ where: { id: user.companyId } })
        : Promise.resolve(0),
    prisma.candidate.count({
      where:
        user.role === "ADMIN"
          ? undefined
          : user.role === "CLIENT" && user.companyId !== null
            ? { companyId: user.companyId }
            : {
                applications: {
                  some: {
                    job: {
                      assignedInterviewerId: user.interviewerId ?? -1,
                    },
                  },
                },
              },
    }),
    prisma.interview.count({
      where: { application: applicationScope },
    }),
    prisma.codingTest.count({
      where: { application: applicationScope },
    }),
    prisma.job.count({
      where: {
        AND: [jobScope, { status: JobStatus.OPEN }],
      },
    }),
    prisma.application.count({
      where: {
        AND: [
          applicationScope,
          {
            status: {
              in: [
                ApplicationPipelineStatus.CV_POOL,
                ApplicationPipelineStatus.EXPERT_REVIEW,
                ApplicationPipelineStatus.TECH_EVALUATION,
                ApplicationPipelineStatus.SHORTLISTED,
                ApplicationPipelineStatus.SELECTED,
              ],
            },
          },
        ],
      },
    }),
    prisma.application.count({
      where: {
        AND: [
          applicationScope,
          { status: ApplicationPipelineStatus.SHORTLISTED },
        ],
      },
    }),
    prisma.application.count({
      where: {
        AND: [
          applicationScope,
          { status: ApplicationPipelineStatus.SELECTED },
        ],
      },
    }),
    prisma.job.count({
      where: {
        AND: [
          jobScope,
          {
            shortlistingDueAt: {
              lt: now,
            },
            shortlistingCompletedAt: null,
          },
        ],
      },
    }),
    prisma.job.findMany({
      where: {
        AND: [jobScope, { status: JobStatus.OPEN }],
      },
      select: {
        id: true,
        title: true,
        requirementLifecycle: true,
        shortlistingDueAt: true,
        shortlistingCompletedAt: true,
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
        _count: {
          select: {
            applications: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 6,
    }),
  ]);

  return {
    companies,
    candidates,
    interviews,
    codingTests,
    activeRequirements,
    pipelineCandidates,
    shortlisted,
    selected,
    slaAtRisk,
    openRequirements,
  };
}

export async function getClientDashboardStats() {
  const user = await requireUser();

  if (user.role !== "CLIENT" || user.companyId === null) {
    throw new AuthorizationError();
  }

  const jobScope = jobScopeWhere(user);
  const applicationScope = applicationScopeWhere(user);

  const [
    activeRequirements,
    profilesInPipeline,
    shortlisted,
    selected,
    hired,
    requirements,
  ] = await Promise.all([
    prisma.job.count({
      where: {
        AND: [jobScope, { status: JobStatus.OPEN }],
      },
    }),
    prisma.application.count({
      where: {
        AND: [
          applicationScope,
          {
            status: {
              in: [
                ApplicationPipelineStatus.CV_POOL,
                ApplicationPipelineStatus.EXPERT_REVIEW,
                ApplicationPipelineStatus.TECH_EVALUATION,
                ApplicationPipelineStatus.SHORTLISTED,
                ApplicationPipelineStatus.SELECTED,
              ],
            },
          },
        ],
      },
    }),
    prisma.application.count({
      where: {
        AND: [
          applicationScope,
          { status: ApplicationPipelineStatus.SHORTLISTED },
        ],
      },
    }),
    prisma.application.count({
      where: {
        AND: [
          applicationScope,
          { status: ApplicationPipelineStatus.SELECTED },
        ],
      },
    }),
    prisma.application.count({
      where: {
        AND: [applicationScope, { status: ApplicationPipelineStatus.HIRED }],
      },
    }),
    prisma.job.findMany({
      where: jobScope,
      select: {
        id: true,
        title: true,
        status: true,
        requirementLifecycle: true,
        location: true,
        numberOfPositions: true,
        targetHireDate: true,
        company: {
          select: {
            name: true,
          },
        },
        applications: {
          select: {
            status: true,
          },
        },
        _count: {
          select: {
            applications: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 6,
    }),
  ]);

  return {
    activeRequirements,
    profilesInPipeline,
    shortlisted,
    selected,
    hired,
    requirements: requirements.map((requirement) => ({
      ...requirement,
      shortlistedCount: requirement.applications.filter(
        (application) => application.status === "SHORTLISTED",
      ).length,
      selectedCount: requirement.applications.filter(
        (application) => application.status === "SELECTED",
      ).length,
      hiredCount: requirement.applications.filter(
        (application) => application.status === "HIRED",
      ).length,
      pipelineCounts: {
        cvPool: requirement.applications.filter(
          (application) => application.status === "CV_POOL",
        ).length,
        expertReview: requirement.applications.filter(
          (application) => application.status === "EXPERT_REVIEW",
        ).length,
        techEvaluation: requirement.applications.filter(
          (application) => application.status === "TECH_EVALUATION",
        ).length,
        shortlisted: requirement.applications.filter(
          (application) => application.status === "SHORTLISTED",
        ).length,
        selected: requirement.applications.filter(
          (application) => application.status === "SELECTED",
        ).length,
        hired: requirement.applications.filter(
          (application) => application.status === "HIRED",
        ).length,
      },
    })),
  };
}

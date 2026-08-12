import { prisma } from "@/lib/prisma";
import { ApplicationPipelineStatus, JobStatus } from "@prisma/client";

import {
  applicationScopeWhere,
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

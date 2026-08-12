import { prisma } from "@/lib/prisma";
import { ApplicationPipelineStatus, JobStatus } from "@prisma/client";

export async function getDashboardStats() {
  const now = new Date();

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
    prisma.company.count(),
    prisma.candidate.count(),
    prisma.interview.count(),
    prisma.codingTest.count(),
    prisma.job.count({
      where: {
        status: JobStatus.OPEN,
      },
    }),
    prisma.application.count({
      where: {
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
    }),
    prisma.application.count({
      where: {
        status: ApplicationPipelineStatus.SHORTLISTED,
      },
    }),
    prisma.application.count({
      where: {
        status: ApplicationPipelineStatus.SELECTED,
      },
    }),
    prisma.job.count({
      where: {
        shortlistingDueAt: {
          lt: now,
        },
        shortlistingCompletedAt: null,
      },
    }),
    prisma.job.findMany({
      where: {
        status: JobStatus.OPEN,
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

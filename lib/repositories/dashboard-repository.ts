import { prisma } from "@/lib/prisma";
import { ApplicationPipelineStatus, JobStatus } from "@prisma/client";
import { isPersonProfilePublished } from "@/lib/profiles/structured-profile";

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

export type DashboardAttentionItem = {
  href: string;
  title: string;
  meta: string;
  urgency: "now" | "next";
};

const PIPELINE_STAGE_LABEL: Record<string, string> = {
  CV_POOL: "CV pool",
  EXPERT_REVIEW: "Expert review",
  TECH_EVALUATION: "Technical evaluation",
  SHORTLISTED: "Shortlisted",
  SELECTED: "Selected",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

export async function getDashboardAttention(): Promise<DashboardAttentionItem[]> {
  const user = await requireUser();
  const now = new Date();
  const jobScope = jobScopeWhere(user);
  const applicationScope = applicationScopeWhere(user);
  const items: DashboardAttentionItem[] = [];

  const [slaJobs, waiting, unpublishedInterviewers] = await Promise.all([
    prisma.job.findMany({
      where: {
        AND: [
          jobScope,
          {
            shortlistingDueAt: { lt: now },
            shortlistingCompletedAt: null,
            status: JobStatus.OPEN,
          },
        ],
      },
      select: {
        id: true,
        title: true,
        company: { select: { name: true } },
      },
      take: 5,
      orderBy: { shortlistingDueAt: "asc" },
    }),
    prisma.application.findMany({
      where: {
        AND: [
          applicationScope,
          {
            status: {
              in: [
                ApplicationPipelineStatus.EXPERT_REVIEW,
                ApplicationPipelineStatus.TECH_EVALUATION,
                ApplicationPipelineStatus.SHORTLISTED,
              ],
            },
          },
        ],
      },
      select: {
        id: true,
        status: true,
        candidate: { select: { id: true, name: true } },
        job: { select: { title: true } },
      },
      take: 8,
      orderBy: { updatedAt: "desc" },
    }),
    user.role === "ADMIN"
      ? prisma.interviewer.findMany({
          select: {
            id: true,
            name: true,
            profile: {
              select: {
                roleTitle: true,
                aboutText: true,
                experiences: true,
                education: true,
                githubUrl: true,
                linkedInUrl: true,
                leetcodeUrl: true,
              },
            },
          },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  for (const job of slaJobs) {
    items.push({
      href: `/dashboard/requirements/${job.id}`,
      title: `${job.title} is past shortlist SLA`,
      meta: job.company.name,
      urgency: "now",
    });
  }

  for (const application of waiting) {
    items.push({
      href: `/dashboard/candidates/${application.candidate.id}`,
      title: `${application.candidate.name} is in ${PIPELINE_STAGE_LABEL[application.status] ?? application.status}`,
      meta: application.job.title,
      urgency:
        application.status === ApplicationPipelineStatus.SHORTLISTED
          ? "now"
          : "next",
    });
  }

  for (const interviewer of unpublishedInterviewers) {
    const experiences = Array.isArray(interviewer.profile?.experiences)
      ? interviewer.profile.experiences
      : [];
    const education = Array.isArray(interviewer.profile?.education)
      ? interviewer.profile.education
      : [];
    if (
      isPersonProfilePublished({
        roleTitle: interviewer.profile?.roleTitle,
        aboutText: interviewer.profile?.aboutText,
        experiences: experiences as never,
        education: education as never,
        githubUrl: interviewer.profile?.githubUrl,
        linkedInUrl: interviewer.profile?.linkedInUrl,
        leetcodeUrl: interviewer.profile?.leetcodeUrl,
      })
    ) {
      continue;
    }
    items.push({
      href: `/dashboard/interviewers/${interviewer.id}`,
      title: `${interviewer.name} has not published a profile`,
      meta: "Hiring teams and candidates cannot learn who is interviewing",
      urgency: "next",
    });
  }

  return items.slice(0, 10);
}

export async function getClientDashboardAttention(): Promise<DashboardAttentionItem[]> {
  const user = await requireUser();
  if (user.role !== "CLIENT" || user.companyId === null) {
    throw new AuthorizationError();
  }
  const applicationScope = applicationScopeWhere(user);

  const waiting = await prisma.application.findMany({
    where: {
      AND: [
        applicationScope,
        {
          status: {
            in: [
              ApplicationPipelineStatus.SHORTLISTED,
              ApplicationPipelineStatus.SELECTED,
            ],
          },
        },
      ],
    },
    select: {
      id: true,
      status: true,
      candidate: { select: { name: true } },
      job: { select: { id: true, title: true } },
    },
    take: 8,
    orderBy: { updatedAt: "desc" },
  });

  return waiting.map((application) => ({
    href: `/client/requirements/${application.job.id}/candidates/${application.id}`,
    title:
      application.status === ApplicationPipelineStatus.SELECTED
        ? `Confirm hire for ${application.candidate.name}`
        : `Review shortlist: ${application.candidate.name}`,
    meta: application.job.title,
    urgency: "now" as const,
  }));
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

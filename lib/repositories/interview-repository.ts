import { prisma } from "@/lib/prisma";

import {
  interviewScopeWhere,
  requireUser,
} from "@/lib/auth/authorization";

const interviewSelect = {
  id: true,
  type: true,
  interviewAt: true,
  result: true,
  applicationId: true,
  application: {
    select: {
      id: true,
      status: true,
      candidate: {
        select: {
          id: true,
          name: true,
        },
      },
      job: {
        select: {
          id: true,
          title: true,
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
} as const;

export async function getInterviews() {
  const user = await requireUser();

  return prisma.interview.findMany({
    where: interviewScopeWhere(user),
    select: interviewSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getInterviewsByJobId(jobId: number) {
  const user = await requireUser();

  return prisma.interview.findMany({
    where: {
      AND: [
        interviewScopeWhere(user),
        {
          application: {
            jobId,
          },
        },
      ],
    },
    select: interviewSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getInterviewById(id: number) {
  const user = await requireUser();

  return prisma.interview.findFirst({
    where: {
      id,
      ...interviewScopeWhere(user),
    },
    select: interviewSelect,
  });
}

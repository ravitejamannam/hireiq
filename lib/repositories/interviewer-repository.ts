import { prisma } from "@/lib/prisma";

import {
  interviewerScopeWhere,
  requireUser,
} from "@/lib/auth/authorization";

const interviewerSelect = {
  id: true,
  name: true,
  category: true,
  availability: true,
  createdAt: true,
  updatedAt: true,
  assignedJobs: {
    select: {
      id: true,
      title: true,
      requirementLifecycle: true,
      status: true,
    },
    orderBy: {
      createdAt: "desc" as const,
    },
  },
};

export async function getInterviewers() {
  const user = await requireUser();
  const scope = interviewerScopeWhere(user);

  if (scope === null) {
    return [];
  }

  return prisma.interviewer.findMany({
    where: scope,
    select: interviewerSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getInterviewerById(id: number) {
  const user = await requireUser();
  const scope = interviewerScopeWhere(user);

  if (scope === null) {
    return null;
  }

  return prisma.interviewer.findFirst({
    where: {
      id,
      ...scope,
    },
    select: interviewerSelect,
  });
}

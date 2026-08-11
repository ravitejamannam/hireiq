import { prisma } from "@/lib/prisma";

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
  return prisma.interviewer.findMany({
    select: interviewerSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getInterviewerById(id: number) {
  return prisma.interviewer.findUnique({
    where: {
      id,
    },
    select: interviewerSelect,
  });
}

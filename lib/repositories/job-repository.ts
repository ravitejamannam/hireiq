import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const jobSelect = {
  id: true,
  title: true,
  status: true,
  companyId: true,
  assignedInterviewerId: true,
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
  clientCompletedAt: true,
  sourcingDatabaseSource: true,
  sourcingAccessDetails: true,
  sourcingAccessReceivedAt: true,
  shortlistingDueAt: true,
  shortlistingCompletedAt: true,
  createdAt: true,
  updatedAt: true,
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
  _count: {
    select: {
      applications: true,
    },
  },
  applications: {
    select: {
      status: true,
    },
  },
} satisfies Prisma.JobSelect;

export async function getJobs() {
  return prisma.job.findMany({
    select: jobSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getJobById(id: number) {
  return prisma.job.findUnique({
    where: {
      id,
    },
    select: jobSelect,
  });
}

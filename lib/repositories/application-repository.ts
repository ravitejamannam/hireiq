import { prisma } from "@/lib/prisma";

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
      company: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
};

export async function getApplications() {
  return prisma.application.findMany({
    select: applicationSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getApplicationById(id: number) {
  return prisma.application.findUnique({
    where: {
      id,
    },
    select: applicationSelect,
  });
}

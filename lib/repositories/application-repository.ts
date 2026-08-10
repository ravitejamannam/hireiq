import { prisma } from "@/lib/prisma";

export async function getApplications() {
  return prisma.application.findMany({
    select: {
      id: true,
      status: true,
      candidateId: true,
      jobId: true,
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
    select: {
      id: true,
      status: true,
      candidateId: true,
      jobId: true,
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
  });
}

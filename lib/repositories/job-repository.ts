import { prisma } from "@/lib/prisma";

export async function getJobs() {
  return prisma.job.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      companyId: true,
      company: {
        select: {
          name: true,
        },
      },
    },
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
    select: {
      id: true,
      title: true,
      status: true,
      companyId: true,
      company: {
        select: {
          name: true,
        },
      },
    },
  });
}

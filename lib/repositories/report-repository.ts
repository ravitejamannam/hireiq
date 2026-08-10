import { prisma } from "@/lib/prisma";

export async function getReports() {
  return prisma.report.findMany({
    select: {
      id: true,
      recommendation: true,
      notes: true,
      applicationId: true,
      application: {
        select: {
          id: true,
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
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getReportById(id: number) {
  return prisma.report.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      recommendation: true,
      notes: true,
      applicationId: true,
      application: {
        select: {
          id: true,
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
    },
  });
}

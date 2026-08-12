import { prisma } from "@/lib/prisma";

import { reportScopeWhere, requireUser } from "@/lib/auth/authorization";

const reportSelect = {
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
} as const;

export async function getReports() {
  const user = await requireUser();

  return prisma.report.findMany({
    where: reportScopeWhere(user),
    select: reportSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getReportById(id: number) {
  const user = await requireUser();

  return prisma.report.findFirst({
    where: {
      id,
      ...reportScopeWhere(user),
    },
    select: reportSelect,
  });
}

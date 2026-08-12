import { prisma } from "@/lib/prisma";

import {
  codingTestScopeWhere,
  requireUser,
} from "@/lib/auth/authorization";

const codingTestSelect = {
  id: true,
  title: true,
  score: true,
  maxScore: true,
  status: true,
  takenAt: true,
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

export async function getCodingTests() {
  const user = await requireUser();

  return prisma.codingTest.findMany({
    where: codingTestScopeWhere(user),
    select: codingTestSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getCodingTestById(id: number) {
  const user = await requireUser();

  return prisma.codingTest.findFirst({
    where: {
      id,
      ...codingTestScopeWhere(user),
    },
    select: codingTestSelect,
  });
}

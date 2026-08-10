import { prisma } from "@/lib/prisma";

export async function getCodingTests() {
  return prisma.codingTest.findMany({
    select: {
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
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getCodingTestById(id: number) {
  return prisma.codingTest.findUnique({
    where: {
      id,
    },
    select: {
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
    },
  });
}

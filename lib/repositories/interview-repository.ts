import { prisma } from "@/lib/prisma";

export async function getInterviews() {
  return prisma.interview.findMany({
    select: {
      id: true,
      type: true,
      interviewAt: true,
      result: true,
      applicationId: true,
      application: {
        select: {
          id: true,
          status: true,
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

export async function getInterviewsByJobId(jobId: number) {
  return prisma.interview.findMany({
    where: {
      application: {
        jobId,
      },
    },
    select: {
      id: true,
      type: true,
      interviewAt: true,
      result: true,
      applicationId: true,
      application: {
        select: {
          id: true,
          status: true,
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

export async function getInterviewById(id: number) {
  return prisma.interview.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      type: true,
      interviewAt: true,
      result: true,
      applicationId: true,
      application: {
        select: {
          id: true,
          status: true,
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

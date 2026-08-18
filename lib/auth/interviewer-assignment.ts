import { AuthorizationError, requireInterviewerPortal } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export async function assertInterviewerOwnsApplication(applicationId: number) {
  const interviewer = await requireInterviewerPortal();

  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      job: {
        assignedInterviewerId: interviewer.interviewerId,
      },
    },
    select: {
      id: true,
      jobId: true,
    },
  });

  if (!application) {
    throw new AuthorizationError("Resource not found.");
  }

  return { interviewer, application };
}

export async function assertInterviewerOwnsInterview(interviewId: number) {
  const interviewer = await requireInterviewerPortal();

  const interview = await prisma.interview.findFirst({
    where: {
      id: interviewId,
      application: {
        job: {
          assignedInterviewerId: interviewer.interviewerId,
        },
      },
    },
    select: {
      id: true,
      applicationId: true,
      application: {
        select: {
          jobId: true,
        },
      },
    },
  });

  if (!interview) {
    throw new AuthorizationError("Resource not found.");
  }

  return { interviewer, interview };
}

export async function assertInterviewerOwnsCodingTest(codingTestId: number) {
  const interviewer = await requireInterviewerPortal();

  const codingTest = await prisma.codingTest.findFirst({
    where: {
      id: codingTestId,
      application: {
        job: {
          assignedInterviewerId: interviewer.interviewerId,
        },
      },
    },
    select: {
      id: true,
      applicationId: true,
      application: {
        select: {
          jobId: true,
        },
      },
    },
  });

  if (!codingTest) {
    throw new AuthorizationError("Resource not found.");
  }

  return { interviewer, codingTest };
}

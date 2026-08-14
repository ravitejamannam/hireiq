import { prisma } from "@/lib/prisma";
import { dispatchClientInAppNotification } from "@/lib/communication/notification-service";
import type { DispatchInAppNotificationResult } from "@/lib/communication/communication-types";
import { JobValidationError } from "@/lib/validation/job-validation";

export type ShortlistCompletionHandoffResult =
  | {
      established: true;
      job: {
        id: number;
        title: string;
        companyId: number;
        assignedInterviewerId: number | null;
        sourcingAccessReceivedAt: Date | null;
        shortlistingDueAt: Date | null;
        shortlistingCompletedAt: Date | null;
        requirementLifecycle: string;
      };
      inApp: DispatchInAppNotificationResult;
    }
  | {
      established: false;
      job: {
        id: number;
        title: string;
        companyId: number;
        assignedInterviewerId: number | null;
        sourcingAccessReceivedAt: Date | null;
        shortlistingDueAt: Date | null;
        shortlistingCompletedAt: Date | null;
        requirementLifecycle: string;
      };
      inApp: null;
    };

const jobHandoffSelect = {
  id: true,
  title: true,
  companyId: true,
  assignedInterviewerId: true,
  sourcingAccessReceivedAt: true,
  shortlistingDueAt: true,
  shortlistingCompletedAt: true,
  requirementLifecycle: true,
} as const;

/**
 * Authoritative T70 handoff: mark shortlisting complete and create
 * CLIENT_SHORTLIST_READY in-app communication for the owning company.
 *
 * Requires at least one SHORTLISTED application. Rejects before writing
 * shortlistingCompletedAt or creating the client notification.
 * Does not change sourcingAccessReceivedAt or shortlistingDueAt.
 * Concurrent callers: only one updateMany wins.
 */
export async function recordShortlistCompletionHandoff(
  jobId: number,
): Promise<ShortlistCompletionHandoffResult> {
  return prisma.$transaction(async (tx) => {
    const shortlistedCount = await tx.application.count({
      where: {
        jobId,
        status: "SHORTLISTED",
      },
    });

    if (shortlistedCount < 1) {
      const currentJob = await tx.job.findUniqueOrThrow({
        where: { id: jobId },
        select: jobHandoffSelect,
      });

      if (currentJob.shortlistingCompletedAt) {
        return {
          established: false,
          job: currentJob,
          inApp: null,
        };
      }

      throw new JobValidationError(
        "Cannot complete shortlisting until at least one candidate has been shortlisted.",
      );
    }

    const transition = await tx.job.updateMany({
      where: {
        id: jobId,
        requirementLifecycle: "SOURCING_SHORTLISTING",
        sourcingAccessReceivedAt: {
          not: null,
        },
        shortlistingCompletedAt: null,
      },
      data: {
        shortlistingCompletedAt: new Date(),
      },
    });

    if (transition.count !== 1) {
      const currentJob = await tx.job.findUniqueOrThrow({
        where: { id: jobId },
        select: jobHandoffSelect,
      });

      if (currentJob.shortlistingCompletedAt) {
        return {
          established: false,
          job: currentJob,
          inApp: null,
        };
      }

      throw new JobValidationError("Invalid sourcing workflow state.");
    }

    const job = await tx.job.findUniqueOrThrow({
      where: { id: jobId },
      select: jobHandoffSelect,
    });

    const inApp = await dispatchClientInAppNotification(
      {
        type: "CLIENT_SHORTLIST_READY",
        jobId,
        message: `Shortlist ready for review: ${job.title}`,
      },
      tx,
    );

    return {
      established: true,
      job,
      inApp,
    };
  });
}

import { prisma } from "@/lib/prisma";
import { dispatchInAppNotification } from "@/lib/communication/notification-service";
import type { DispatchInAppNotificationResult } from "@/lib/communication/communication-types";
import { JobValidationError } from "@/lib/validation/job-validation";

/** Existing HireIQ shortlisting SLA: 24 hours from database-access handoff. */
export const SHORTLISTING_SLA_HOURS = 24;

export type SourcingAccessHandoffResult =
  | {
      established: true;
      job: {
        id: number;
        title: string;
        sourcingAccessReceivedAt: Date | null;
        shortlistingDueAt: Date | null;
        requirementLifecycle: string;
        assignedInterviewerId: number | null;
        companyId: number;
      };
      inApp: DispatchInAppNotificationResult;
    }
  | {
      established: false;
      job: {
        id: number;
        title: string;
        sourcingAccessReceivedAt: Date | null;
        shortlistingDueAt: Date | null;
        requirementLifecycle: string;
        assignedInterviewerId: number | null;
        companyId: number;
      };
      inApp: null;
    };

/**
 * Authoritative T69 handoff: record database access, start the 24h SLA,
 * and create INTERVIEWER_DATABASE_READY in-app communication.
 *
 * Concurrent callers: only one updateMany wins. The loser does not reset
 * sourcingAccessReceivedAt / shortlistingDueAt and does not send a second email.
 */
export async function recordSourcingAccessHandoff(
  jobId: number,
): Promise<SourcingAccessHandoffResult> {
  const sourcingAccessReceivedAt = new Date();
  const shortlistingDueAt = new Date(
    sourcingAccessReceivedAt.getTime() +
      SHORTLISTING_SLA_HOURS * 60 * 60 * 1000,
  );

  return prisma.$transaction(async (tx) => {
    const transition = await tx.job.updateMany({
      where: {
        id: jobId,
        requirementLifecycle: "INTERVIEWER_NOTIFIED",
        sourcingAccessReceivedAt: null,
      },
      data: {
        sourcingAccessReceivedAt,
        shortlistingDueAt,
        requirementLifecycle: "SOURCING_SHORTLISTING",
      },
    });

    if (transition.count !== 1) {
      const currentJob = await tx.job.findUniqueOrThrow({
        where: { id: jobId },
        select: {
          id: true,
          title: true,
          sourcingAccessReceivedAt: true,
          shortlistingDueAt: true,
          requirementLifecycle: true,
          assignedInterviewerId: true,
          companyId: true,
        },
      });

      if (currentJob.sourcingAccessReceivedAt) {
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
      select: {
        id: true,
        title: true,
        sourcingAccessReceivedAt: true,
        shortlistingDueAt: true,
        requirementLifecycle: true,
        assignedInterviewerId: true,
        companyId: true,
      },
    });

    const inApp = await dispatchInAppNotification(
      {
        type: "INTERVIEWER_DATABASE_READY",
        jobId,
        message: `Database ready — sourcing window has started (24h): ${job.title}`,
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

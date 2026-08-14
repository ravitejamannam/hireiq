import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  DispatchInAppNotificationInput,
  DispatchInAppNotificationResult,
  EmailDeliveryResult,
  InAppNotificationRecord,
} from "@/lib/communication/communication-types";
import { deliverRequirementReadyEmail } from "@/lib/communication/requirement-ready-email";
import {
  NotificationValidationError,
  validateNotificationJobId,
  validateNotificationType,
} from "@/lib/validation/notification-validation";

type NotificationDb = {
  job: Pick<typeof prisma.job, "findUnique">;
  interviewer: Pick<typeof prisma.interviewer, "findUnique">;
  notification: Pick<
    typeof prisma.notification,
    "findUnique" | "create"
  >;
  user: Pick<typeof prisma.user, "findFirst">;
};

const DEFERRED_EMAIL = {
  attempted: false,
  reason: "email-delivery-deferred",
} as const;

function validateNotificationMessage(message: unknown) {
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new NotificationValidationError("Notification message is invalid.");
  }

  return message.trim();
}

function toNotificationRecord(row: {
  id: number;
  type: DispatchInAppNotificationInput["type"];
  message: string;
  jobId: number;
  interviewerId: number;
  createdAt: Date;
}): InAppNotificationRecord {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    jobId: row.jobId,
    interviewerId: row.interviewerId,
    createdAt: row.createdAt,
  };
}

function isNotificationUniquenessConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Resolve the in-app recipient from the Job's assigned interviewer.
 * Never accepts interviewerId, companyId, or userId from the caller.
 */
export async function resolveAssignedInterviewerRecipient(
  jobId: number,
  db: NotificationDb = prisma,
) {
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      companyId: true,
      assignedInterviewerId: true,
    },
  });

  if (!job) {
    throw new NotificationValidationError("Resource not found.");
  }

  if (!job.assignedInterviewerId) {
    throw new NotificationValidationError(
      "Interviewer must be assigned before notification.",
    );
  }

  const interviewer = await db.interviewer.findUnique({
    where: { id: job.assignedInterviewerId },
    select: { id: true },
  });

  if (!interviewer) {
    throw new NotificationValidationError("Interviewer not found.");
  }

  const user = await db.user.findFirst({
    where: {
      interviewerId: interviewer.id,
      role: "INTERVIEWER",
    },
    select: {
      email: true,
    },
  });

  return {
    jobId: job.id,
    companyId: job.companyId,
    interviewerId: interviewer.id,
    email: user?.email ?? null,
  };
}

/**
 * Create an in-app Notification for the Job's assigned interviewer.
 *
 * Idempotent on @@unique([jobId, interviewerId, type]).
 * Does not send email. Does not accept recipient IDs from the caller.
 */
export async function dispatchInAppNotification(
  input: DispatchInAppNotificationInput,
  db: NotificationDb = prisma,
): Promise<DispatchInAppNotificationResult> {
  const jobId = validateNotificationJobId(input.jobId);
  const type = validateNotificationType(input.type);
  const message = validateNotificationMessage(input.message);
  const recipient = await resolveAssignedInterviewerRecipient(jobId, db);

  const existing = await db.notification.findUnique({
    where: {
      jobId_interviewerId_type: {
        jobId: recipient.jobId,
        interviewerId: recipient.interviewerId,
        type,
      },
    },
    select: {
      id: true,
      type: true,
      message: true,
      jobId: true,
      interviewerId: true,
      createdAt: true,
    },
  });

  if (existing) {
    return {
      created: false,
      notification: toNotificationRecord(existing),
      recipient,
      email: DEFERRED_EMAIL,
    };
  }

  try {
    const created = await db.notification.create({
      data: {
        type,
        message,
        jobId: recipient.jobId,
        interviewerId: recipient.interviewerId,
      },
      select: {
        id: true,
        type: true,
        message: true,
        jobId: true,
        interviewerId: true,
        createdAt: true,
      },
    });

    return {
      created: true,
      notification: toNotificationRecord(created),
      recipient,
      email: DEFERRED_EMAIL,
    };
  } catch (error) {
    if (!isNotificationUniquenessConflict(error)) {
      throw error;
    }

    const raced = await db.notification.findUnique({
      where: {
        jobId_interviewerId_type: {
          jobId: recipient.jobId,
          interviewerId: recipient.interviewerId,
          type,
        },
      },
      select: {
        id: true,
        type: true,
        message: true,
        jobId: true,
        interviewerId: true,
        createdAt: true,
      },
    });

    if (!raced) {
      throw error;
    }

    return {
      created: false,
      notification: toNotificationRecord(raced),
      recipient,
      email: DEFERRED_EMAIL,
    };
  }
}

/**
 * Send the T68 requirement-ready email only when a new in-app
 * notification was created. Duplicate in-app rows skip email.
 * Delivery happens after the DB transaction commits.
 */
export async function finalizeRequirementReadyCommunication(
  inApp: DispatchInAppNotificationResult,
): Promise<EmailDeliveryResult> {
  if (!inApp.created) {
    return {
      attempted: false,
      reason: "already-notified",
    };
  }

  return deliverRequirementReadyEmail(inApp.notification.jobId);
}

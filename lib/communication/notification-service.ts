import { } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  DispatchInAppNotificationInput,
  DispatchInAppNotificationResult,
  EmailDeliveryResult,
  InAppNotificationRecord,
} from "@/lib/communication/communication-types";
import { deliverRequirementReadyEmail } from "@/lib/communication/requirement-ready-email";
import { deliverDatabaseReadyEmail } from "@/lib/communication/database-ready-email";
import { deliverShortlistReadyEmail } from "@/lib/communication/shortlist-ready-email";
import { findActiveOwnerEmail } from "@/lib/organizations/active-owner";
import {
  NotificationValidationError,
  validateNotificationJobId,
  validateNotificationType,
} from "@/lib/validation/notification-validation";
import { getPrismaErrorCode } from "@/lib/prisma-error";

type NotificationDb = {
  job: Pick<typeof prisma.job, "findUnique">;
  interviewer: Pick<typeof prisma.interviewer, "findUnique">;
  notification: Pick<
    typeof prisma.notification,
    "findUnique" | "findFirst" | "create" | "update"
  >;
  user: Pick<typeof prisma.user, "findFirst">;
  organizationMember: Pick<typeof prisma.organizationMember, "findFirst">;
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
  interviewerId: number | null;
  companyId: number;
  createdAt: Date;
}): InAppNotificationRecord {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    jobId: row.jobId,
    interviewerId: row.interviewerId,
    companyId: row.companyId,
    createdAt: row.createdAt,
  };
}

function isNotificationUniquenessConflict(error: unknown) {
  return (
    getPrismaErrorCode(error) === "P2002"
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
      companyId: true,
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
        companyId: recipient.companyId,
      },
      select: {
        id: true,
        type: true,
        message: true,
        jobId: true,
        interviewerId: true,
        companyId: true,
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
        companyId: true,
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

const RETRYABLE_NOTIFICATION_TYPES = [
  "INTERVIEWER_REQUIREMENT_READY",
  "INTERVIEWER_DATABASE_READY",
  "CLIENT_SHORTLIST_READY",
] as const;

async function persistSuccessfulEmailDelivery(
  notificationId: number,
  email: EmailDeliveryResult,
) {
  // Observability: never let an email failure disappear silently. The
  // notification row still exists (in-app channel works), but operators
  // need to see delivery gaps in server logs.
  if (!email.attempted) {
    console.warn("[email] delivery not attempted", {
      notificationId,
      reason: email.reason ?? null,
    });
    return email;
  }
  if (!email.sent) {
    console.warn("[email] delivery failed", {
      notificationId,
      reason: email.reason ?? null,
      detail: "error" in email ? String(email.error) : null,
    });
    return email;
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { emailDeliveredAt: new Date() },
  });

  return email;
}

/**
 * Send the T68 requirement-ready email only when a new in-app
 * notification was created. Duplicate in-app rows skip this first-path send.
 * Delivery happens after the DB transaction commits.
 * Unsent first-path email is retried via retryNotificationEmail().
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

  if (inApp.notification.type !== "INTERVIEWER_REQUIREMENT_READY") {
    return {
      attempted: false,
      reason: "no-requirement-ready-notification",
    };
  }

  return persistSuccessfulEmailDelivery(
    inApp.notification.id,
    await deliverRequirementReadyEmail(inApp.notification.jobId),
  );
}

/**
 * Send the T69 database-ready email only when a new in-app
 * INTERVIEWER_DATABASE_READY notification was created.
 */
export async function finalizeDatabaseReadyCommunication(
  inApp: DispatchInAppNotificationResult,
): Promise<EmailDeliveryResult> {
  if (!inApp.created) {
    return {
      attempted: false,
      reason: "already-notified",
    };
  }

  if (inApp.notification.type !== "INTERVIEWER_DATABASE_READY") {
    return {
      attempted: false,
      reason: "no-database-ready-notification",
    };
  }

  return persistSuccessfulEmailDelivery(
    inApp.notification.id,
    await deliverDatabaseReadyEmail(inApp.notification.jobId),
  );
}

const notificationRecordSelect = {
  id: true,
  type: true,
  message: true,
  jobId: true,
  interviewerId: true,
  companyId: true,
  createdAt: true,
} as const;

/**
 * Resolve the Client email from the Job's owning company.
 * Never accepts companyId, userId, or recipient email from the caller.
 */
export async function resolveOwningClientRecipient(
  jobId: number,
  db: NotificationDb = prisma,
) {
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      companyId: true,
    },
  });

  if (!job) {
    throw new NotificationValidationError("Resource not found.");
  }

  const email = await findActiveOwnerEmail(job.companyId, db);

  return {
    jobId: job.id,
    companyId: job.companyId,
    interviewerId: null,
    email,
  };
}

/**
 * Create a company-scoped in-app Notification for the Job's Client.
 * Idempotent on @@unique([jobId, companyId, type]).
 */
export async function dispatchClientInAppNotification(
  input: DispatchInAppNotificationInput,
  db: NotificationDb = prisma,
): Promise<DispatchInAppNotificationResult> {
  const jobId = validateNotificationJobId(input.jobId);
  const type = validateNotificationType(input.type);
  const message = validateNotificationMessage(input.message);
  const recipient = await resolveOwningClientRecipient(jobId, db);

  const existing = await db.notification.findUnique({
    where: {
      jobId_companyId_type: {
        jobId: recipient.jobId,
        companyId: recipient.companyId,
        type,
      },
    },
    select: notificationRecordSelect,
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
        companyId: recipient.companyId,
        interviewerId: null,
      },
      select: notificationRecordSelect,
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
        jobId_companyId_type: {
          jobId: recipient.jobId,
          companyId: recipient.companyId,
          type,
        },
      },
      select: notificationRecordSelect,
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
 * Send the T70 shortlist-ready email only when a new in-app
 * CLIENT_SHORTLIST_READY notification was created.
 */
export async function finalizeShortlistReadyCommunication(
  inApp: DispatchInAppNotificationResult,
): Promise<EmailDeliveryResult> {
  if (!inApp.created) {
    return {
      attempted: false,
      reason: "already-notified",
    };
  }

  if (inApp.notification.type !== "CLIENT_SHORTLIST_READY") {
    return {
      attempted: false,
      reason: "no-shortlist-ready-notification",
    };
  }

  return persistSuccessfulEmailDelivery(
    inApp.notification.id,
    await deliverShortlistReadyEmail(inApp.notification.jobId),
  );
}

function isRetryableNotificationType(
  type: string,
): type is (typeof RETRYABLE_NOTIFICATION_TYPES)[number] {
  return RETRYABLE_NOTIFICATION_TYPES.some((retryable) => retryable === type);
}

/**
 * Retry outbound email for an existing T68/T69/T70 Notification.
 * Does not create another Notification or change workflow state.
 * Recipient is resolved from the Job, never from caller input.
 */
export async function retryNotificationEmail(
  notificationId: number,
): Promise<EmailDeliveryResult> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: {
      id: true,
      type: true,
      jobId: true,
      emailDeliveredAt: true,
    },
  });

  if (!notification) {
    throw new NotificationValidationError("Notification not found.");
  }

  if (!isRetryableNotificationType(notification.type)) {
    throw new NotificationValidationError("Notification type is invalid.");
  }

  if (notification.emailDeliveredAt) {
    return {
      attempted: false,
      reason: "already-delivered",
    };
  }

  let email: EmailDeliveryResult;

  if (notification.type === "INTERVIEWER_REQUIREMENT_READY") {
    email = await deliverRequirementReadyEmail(notification.jobId);
  } else if (notification.type === "INTERVIEWER_DATABASE_READY") {
    email = await deliverDatabaseReadyEmail(notification.jobId);
  } else {
    email = await deliverShortlistReadyEmail(notification.jobId);
  }

  return persistSuccessfulEmailDelivery(notification.id, email);
}

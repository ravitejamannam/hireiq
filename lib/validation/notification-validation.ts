import { NotificationType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class NotificationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationValidationError";
  }
}

export function validateNotificationId(id: unknown) {
  return validatePositiveInteger(
    id,
    "Notification ID must be a positive integer.",
  );
}

export function validateNotificationJobId(jobId: unknown) {
  return validatePositiveInteger(
    jobId,
    "Job ID must be a positive integer.",
  );
}

export function validateNotificationInterviewerId(interviewerId: unknown) {
  return validatePositiveInteger(
    interviewerId,
    "Interviewer ID must be a positive integer.",
  );
}

export function validateNotificationType(type: unknown) {
  if (
    typeof type !== "string" ||
    !Object.values(NotificationType).includes(type as NotificationType)
  ) {
    throw new NotificationValidationError("Notification type is invalid.");
  }

  return type as NotificationType;
}

export async function ensureNotificationExists(id: number) {
  const notification = await prisma.notification.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (!notification) {
    throw new NotificationValidationError("Notification not found.");
  }

  return notification;
}

function validatePositiveInteger(value: unknown, message: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new NotificationValidationError(message);
  }

  return value;
}

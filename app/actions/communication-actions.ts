"use server";

import { revalidatePath } from "next/cache";

import {
  AuthorizationError,
  assertCanRetryNotificationEmail,
  notificationScopeWhere,
  requireUser,
} from "@/lib/auth/authorization";
import { retryNotificationEmail } from "@/lib/communication/notification-service";
import { prisma } from "@/lib/prisma";
import { validateNotificationId } from "@/lib/validation/notification-validation";

/**
 * Admin-only retry of T68/T69/T70 outbound email.
 * Recipient is resolved from the Job. Does not accept email/companyId/interviewerId.
 */
export async function retryNotificationEmailDelivery(notificationId: unknown) {
  const user = await requireUser();
  assertCanRetryNotificationEmail(user);

  const id = validateNotificationId(notificationId);
  const notification = await prisma.notification.findFirst({
    where: {
      id,
      ...notificationScopeWhere(user),
    },
    select: {
      id: true,
      jobId: true,
    },
  });

  if (!notification) {
    throw new AuthorizationError("Resource not found.");
  }

  const email = await retryNotificationEmail(notification.id);

  try {
    revalidatePath("/dashboard/notifications");
    revalidatePath(`/dashboard/requirements/${notification.jobId}`);
  } catch {
    // revalidatePath requires a Next.js request context
  }

  return email;
}

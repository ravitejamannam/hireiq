import type { NotificationType } from "@prisma/client";

/**
 * T67 communication foundation types.
 *
 * In-app Notification remains the persisted record.
 * Email delivery is intentionally deferred to T68–T70.
 * Read/unread and history are deferred to T71 — the current
 * Notification model has no readAt/unread field.
 */

export type CommunicationRecipient = {
  interviewerId: number;
  companyId: number;
  jobId: number;
  email: string | null;
};

export type InAppNotificationRecord = {
  id: number;
  type: NotificationType;
  message: string;
  jobId: number;
  interviewerId: number;
  createdAt: Date;
};

export type DeferredEmailResult = {
  attempted: false;
  reason: "email-delivery-deferred";
};

export type DispatchInAppNotificationInput = {
  type: NotificationType;
  jobId: number;
  message: string;
};

export type DispatchInAppNotificationResult = {
  created: boolean;
  notification: InAppNotificationRecord;
  recipient: CommunicationRecipient;
  email: DeferredEmailResult;
};

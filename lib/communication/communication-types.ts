import type { NotificationType } from "@prisma/client";

/**
 * T67 communication foundation types.
 * T68 adds requirement-ready email delivery results.
 * Read/unread and history remain deferred to T71.
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

export type RequirementReadyEmailPreview = {
  to: string;
  subject: string;
  text: string;
  requirementPath: string;
};

export type EmailDeliveryResult =
  | {
      attempted: false;
      reason: "already-notified" | "no-requirement-ready-notification";
    }
  | {
      attempted: true;
      sent: true;
      provider: "resend";
      to: string;
    }
  | {
      attempted: true;
      sent: false;
      reason: "provider-not-configured";
      to: string | null;
      preview: RequirementReadyEmailPreview | null;
    }
  | {
      attempted: true;
      sent: false;
      reason: "missing-recipient-email";
      to: null;
    }
  | {
      attempted: true;
      sent: false;
      reason: "provider-error";
      to: string;
      error: string;
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

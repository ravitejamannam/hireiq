import type { EmailDeliveryResult } from "@/lib/communication/communication-types";

export type CommunicationEmailEvent = "T68" | "T69" | "T70";

/**
 * Workflow already committed. This copy must not imply rollback.
 */
export function describeUnsentCommunicationEmail(
  email: EmailDeliveryResult | null | undefined,
  event: CommunicationEmailEvent,
): string | null {
  if (!email || !email.attempted || email.sent) {
    return null;
  }

  if (email.reason === "missing-recipient-email") {
    if (event === "T70") {
      return "Shortlisting was completed, but no client login email is configured.";
    }
    if (event === "T69") {
      return "Database access was recorded, but no interviewer login email is configured.";
    }
    return "Interviewer was notified in-app, but no interviewer login email is configured.";
  }

  if (email.reason === "provider-not-configured") {
    if (event === "T70") {
      return "Shortlisting was completed. The shortlist-ready email was not sent because email is not configured.";
    }
    if (event === "T69") {
      return "Database access was recorded. The database-ready email was not sent because email is not configured.";
    }
    return "Interviewer was notified in-app. The requirement-ready email was not sent because email is not configured.";
  }

  if (email.reason === "provider-error") {
    if (event === "T70") {
      return "Shortlisting was completed, but the shortlist-ready email could not be sent.";
    }
    if (event === "T69") {
      return "Database access was recorded, but the database-ready email could not be sent.";
    }
    return "Interviewer was notified in-app, but the requirement-ready email could not be sent.";
  }

  return null;
}

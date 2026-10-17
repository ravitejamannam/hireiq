import type { EmailDeliveryOutcome } from "@prisma/client";

import type { EmailTransportResult } from "@/lib/communication/email-transport";

export function outcomeFromTransport(
  result: EmailTransportResult,
): EmailDeliveryOutcome {
  if (result.sent) {
    return "SENT";
  }
  if (result.reason === "provider-not-configured") {
    return "PROVIDER_NOT_CONFIGURED";
  }
  return "PROVIDER_ERROR";
}

export function describeEmailDeliveryOutcome(
  outcome: EmailDeliveryOutcome | null | undefined,
): string | null {
  if (!outcome) {
    return null;
  }
  if (outcome === "SENT") {
    return "Email sent.";
  }
  if (outcome === "PROVIDER_NOT_CONFIGURED") {
    return "Email was not sent because email is not configured.";
  }
  if (outcome === "MISSING_RECIPIENT") {
    return "Email was not sent because no recipient is on file.";
  }
  return "Email could not be sent.";
}

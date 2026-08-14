import {
  getEmailFromAddress,
  getResendApiKey,
} from "@/lib/communication/email-config";

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailTransportResult =
  | { sent: true; provider: "resend" }
  | { sent: false; reason: "provider-not-configured" }
  | { sent: false; reason: "provider-error"; error: string };

/**
 * Smallest T68 transport: Resend HTTP API when configured.
 * No new npm provider package. Credentials come from the environment.
 */
export async function sendOutboundEmail(
  email: OutboundEmail,
): Promise<EmailTransportResult> {
  const apiKey = getResendApiKey();
  const from = getEmailFromAddress();

  if (!apiKey || !from) {
    return { sent: false, reason: "provider-not-configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return {
      sent: false,
      reason: "provider-error",
      error: `Resend HTTP ${response.status}: ${detail.slice(0, 300)}`,
    };
  }

  return { sent: true, provider: "resend" };
}

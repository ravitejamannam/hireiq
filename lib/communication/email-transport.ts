import {
  getEmailFromAddress,
  getResendApiKey,
} from "@/lib/communication/email-config";
import { prisma } from "@/lib/prisma";
import { isProductionRuntime } from "@/lib/production/assert-env";

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

const MAX_ATTEMPTS = 8;

function nextRetryAt(attempts: number) {
  const minutes = Math.min(2 ** Math.max(attempts, 0), 240);
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function persistFailure(
  email: OutboundEmail,
  result: Extract<EmailTransportResult, { sent: false }>,
) {
  if (result.reason === "provider-not-configured" && !isProductionRuntime()) {
    return;
  }

  const error =
    result.reason === "provider-error"
      ? result.error
      : "provider-not-configured";

  try {
    await prisma.outboundEmailAttempt.create({
      data: {
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        status: "FAILED",
        attempts: 1,
        lastError: error.slice(0, 500),
        nextRetryAt: nextRetryAt(1),
      },
    });
  } catch (error) {
    console.error("[email] persist failure row failed", error);
  }
}

async function deliverViaResend(
  email: OutboundEmail,
): Promise<EmailTransportResult> {
  const apiKey = getResendApiKey();
  const from = getEmailFromAddress();

  if (!apiKey || !from) {
    if (isProductionRuntime()) {
      console.error("[email] Resend is required in production and is not configured");
    }
    return { sent: false, reason: "provider-not-configured" };
  }

  try {
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
      signal: AbortSignal.timeout(10_000),
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      sent: false,
      reason: "provider-error",
      error: detail.slice(0, 300),
    };
  }
}

/**
 * Smallest T68 transport: Resend HTTP API when configured.
 * Production failures are queued for cron retry.
 */
export async function sendOutboundEmail(
  email: OutboundEmail,
): Promise<EmailTransportResult> {
  const result = await deliverViaResend(email);
  if (!result.sent) {
    await persistFailure(email, result);
  }
  return result;
}

export async function retryPendingOutboundEmails(limit = 25): Promise<{
  attempted: number;
  sent: number;
}> {
  const now = new Date();
  const rows = await prisma.outboundEmailAttempt.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      nextRetryAt: { lte: now },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
  });

  let sent = 0;
  for (const row of rows) {
    const result = await deliverViaResend({
      to: row.to,
      subject: row.subject,
      text: row.text,
      html: row.html,
    });
    const attempts = row.attempts + 1;
    if (result.sent) {
      sent += 1;
      await prisma.outboundEmailAttempt.update({
        where: { id: row.id },
        data: {
          status: "SENT",
          attempts,
          sentAt: now,
          lastError: null,
        },
      });
      continue;
    }

    const exhausted = attempts >= MAX_ATTEMPTS;
    await prisma.outboundEmailAttempt.update({
      where: { id: row.id },
      data: {
        status: exhausted ? "FAILED" : "FAILED",
        attempts,
        lastError:
          result.reason === "provider-error"
            ? result.error.slice(0, 500)
            : result.reason,
        nextRetryAt: exhausted
          ? new Date("2099-01-01T00:00:00.000Z")
          : nextRetryAt(attempts),
      },
    });
  }

  return { attempted: rows.length, sent };
}

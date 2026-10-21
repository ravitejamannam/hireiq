import type { Prisma } from "@prisma/client";

import {
  getEmailFromAddress,
  getResendApiKey,
} from "@/lib/communication/email-config";
import { prisma } from "@/lib/prisma";
import { withCandidateWriteGuard } from "@/lib/privacy/erasure-guard";
import { isProductionRuntime } from "@/lib/production/assert-env";

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Tenant and candidate this message is about. Lets erasure find and cancel it. Omit for system mail. */
  scope?: { companyId: number; candidateId: number };
  /**
   * Default true: a failed send is queued for retry. Set false for one-time-link mail that expires before a retry
   * could help (portal sign-in), so its content is never stored at rest.
   */
  queueOnFailure?: boolean;
};

export type EmailTransportResult =
  | { sent: true; provider: "resend" }
  | { sent: false; reason: "provider-not-configured" }
  /** `erased` is set when the candidate was erased, so nothing was sent and nothing is queued. */
  | { sent: false; reason: "provider-error"; error: string; erased?: true };

const MAX_ATTEMPTS = 8;

function nextRetryAt(attempts: number) {
  const minutes = Math.min(2 ** Math.max(attempts, 0), 240);
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function persistFailure(
  email: OutboundEmail,
  result: Extract<EmailTransportResult, { sent: false }>,
) {
  if (("erased" in result && result.erased) || email.queueOnFailure === false) return;
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
        companyId: email.scope?.companyId ?? null,
        candidateId: email.scope?.candidateId ?? null,
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
  let result: EmailTransportResult;
  if (email.scope) {
    // The candidate lock is held through the provider call: erasure either runs before this send
    // (and it is refused) or waits until it has finished.
    const guarded = await withCandidateWriteGuard(email.scope.candidateId, email.scope.companyId, () => deliverViaResend(email), { timeoutMs: 20_000 });
    result = guarded.ok ? guarded.value : { sent: false, reason: "provider-error", error: "recipient-erased", erased: true };
  } else {
    result = await deliverViaResend(email);
  }
  if (!result.sent) {
    await persistFailure(email, result);
  }
  return result;
}

const LEASE_MS = 5 * 60 * 1000;

/** `only` narrows the sweep. Production passes nothing. Tests use it so they never send another suite's rows. */
export async function retryPendingOutboundEmails(limit = 25, only?: Prisma.OutboundEmailAttemptWhereInput): Promise<{
  attempted: number;
  sent: number;
}> {
  const now = new Date();
  const rows = await prisma.outboundEmailAttempt.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      nextRetryAt: { lte: now },
      attempts: { lt: MAX_ATTEMPTS },
      ...(only ? { AND: [only] } : {}),
    },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
  });

  let attempted = 0;
  let sent = 0;
  for (const row of rows) {
    // Claim the row. A concurrent worker that selected it too loses here, so a message is sent by one worker.
    const claim = await prisma.outboundEmailAttempt.updateMany({
      where: { id: row.id, status: { in: ["PENDING", "FAILED"] }, attempts: row.attempts, nextRetryAt: { lte: now } },
      data: { nextRetryAt: new Date(now.getTime() + LEASE_MS) },
    });
    if (claim.count !== 1) continue;

    const attempt = async (db: Pick<typeof prisma, "outboundEmailAttempt">): Promise<"sent" | "failed" | "skipped"> => {
      // Re-read the current row. Erasure may have cancelled or emptied it since it was selected, so the
      // stored copy in `row` is never what gets sent.
      const current = await db.outboundEmailAttempt.findUnique({ where: { id: row.id } });
      if (!current || (current.status !== "PENDING" && current.status !== "FAILED")) return "skipped";
      const result = await deliverViaResend({ to: current.to, subject: current.subject, text: current.text, html: current.html });
      const attempts = current.attempts + 1;
      if (result.sent) {
        await db.outboundEmailAttempt.update({ where: { id: row.id }, data: { status: "SENT", attempts, sentAt: now, lastError: null } });
        return "sent";
      }
      const exhausted = attempts >= MAX_ATTEMPTS;
      await db.outboundEmailAttempt.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          attempts,
          lastError: result.reason === "provider-error" ? result.error.slice(0, 500) : result.reason,
          nextRetryAt: exhausted ? new Date("2099-01-01T00:00:00.000Z") : nextRetryAt(attempts),
        },
      });
      return "failed";
    };

    let outcome: "sent" | "failed" | "skipped";
    if (row.companyId !== null && row.candidateId !== null) {
      // Tagged row: hold the candidate lock through the send, and refuse for an erased candidate.
      const guarded = await withCandidateWriteGuard(row.candidateId, row.companyId, (tx) => attempt(tx), { timeoutMs: 30_000 });
      if (!guarded.ok) {
        await prisma.outboundEmailAttempt.updateMany({
          where: { id: row.id, companyId: row.companyId },
          data: { to: "erased@erased.invalid", subject: "erased", text: "", html: "", lastError: null, status: "CANCELLED", nextRetryAt: new Date("2099-01-01T00:00:00.000Z") },
        });
        continue;
      }
      outcome = guarded.value;
    } else {
      outcome = await attempt(prisma);
    }
    if (outcome === "skipped") continue;
    attempted += 1;
    if (outcome === "sent") sent += 1;
  }

  return { attempted, sent };
}

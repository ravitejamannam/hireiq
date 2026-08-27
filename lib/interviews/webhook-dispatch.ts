import { createHmac } from "node:crypto";

import { decryptCredentialSecret } from "@/lib/crypto/credential-encryption";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/obs/report-error";

/**
 * Outbound webhook dispatch (T112 Phase 12) with durable retries.
 *
 * Delivery guarantees:
 * - HMAC-SHA256 signature in `X-HireIQ-Signature`.
 * - A row is persisted before the first attempt.
 * - Failures never block the triggering action.
 */

export class WebhookDispatchError extends Error {}

type WebhookEvent = {
  event: string;
  data: Record<string, unknown>;
  companyId: number;
};

const MAX_ATTEMPTS = 8;

function nextRetryAt(attempts: number) {
  const minutes = Math.min(2 ** Math.max(attempts, 0), 240);
  return new Date(Date.now() + minutes * 60 * 1000);
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function decryptSecret(encrypted: string): string {
  return decryptCredentialSecret(encrypted);
}

async function deliverOnce(input: {
  url: string;
  secretEnc: string;
  payload: string;
}): Promise<{ ok: boolean; statusCode: number | null; error: string | null }> {
  const secret = decryptSecret(input.secretEnc);
  const signature = signPayload(input.payload, secret);
  try {
    const res = await fetch(input.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-HireIQ-Signature": `sha256=${signature}`,
      },
      body: input.payload,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      return { ok: true, statusCode: res.status, error: null };
    }
    return {
      ok: false,
      statusCode: res.status,
      error: `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Enqueue and attempt delivery for all matching webhook subscriptions. */
export async function dispatchWebhookEvent(
  event: WebhookEvent,
): Promise<void> {
  const subscriptions = await prisma.partnerWebhookSubscription.findMany({
    where: { companyId: event.companyId, active: true },
    select: { id: true, url: true, secretEnc: true, events: true },
  });
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    event: event.event,
    timestamp: new Date().toISOString(),
    data: event.data,
  });

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      if (sub.events.length > 0 && !sub.events.includes(event.event)) {
        return;
      }

      const row = await prisma.outboundWebhookDelivery.create({
        data: {
          subscriptionId: sub.id,
          event: event.event,
          payload,
          status: "PENDING",
          attempts: 0,
          nextRetryAt: new Date(),
        },
        select: { id: true },
      });

      const result = await deliverOnce({
        url: sub.url,
        secretEnc: sub.secretEnc,
        payload,
      });

      if (result.ok) {
        await prisma.outboundWebhookDelivery.update({
          where: { id: row.id },
          data: {
            status: "DELIVERED",
            attempts: 1,
            lastStatusCode: result.statusCode,
            deliveredAt: new Date(),
          },
        });
        return;
      }

      reportError("webhook-dispatch", result.error, {
        subId: sub.id,
        url: sub.url,
      });
      await prisma.outboundWebhookDelivery.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          attempts: 1,
          lastStatusCode: result.statusCode,
          lastError: result.error?.slice(0, 500),
          nextRetryAt: nextRetryAt(1),
        },
      });
    }),
  );
}

export async function retryPendingWebhookDeliveries(limit = 25): Promise<{
  attempted: number;
  delivered: number;
}> {
  const now = new Date();
  const rows = await prisma.outboundWebhookDelivery.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      nextRetryAt: { lte: now },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
    include: {
      subscription: { select: { url: true, secretEnc: true, active: true } },
    },
  });

  let delivered = 0;
  for (const row of rows) {
    if (!row.subscription.active) {
      continue;
    }
    const result = await deliverOnce({
      url: row.subscription.url,
      secretEnc: row.subscription.secretEnc,
      payload: row.payload,
    });
    const attempts = row.attempts + 1;
    if (result.ok) {
      delivered += 1;
      await prisma.outboundWebhookDelivery.update({
        where: { id: row.id },
        data: {
          status: "DELIVERED",
          attempts,
          lastStatusCode: result.statusCode,
          lastError: null,
          deliveredAt: now,
        },
      });
      continue;
    }

    const exhausted = attempts >= MAX_ATTEMPTS;
    await prisma.outboundWebhookDelivery.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        attempts,
        lastStatusCode: result.statusCode,
        lastError: result.error?.slice(0, 500),
        nextRetryAt: exhausted
          ? new Date("2099-01-01T00:00:00.000Z")
          : nextRetryAt(attempts),
      },
    });
  }

  return { attempted: rows.length, delivered };
}

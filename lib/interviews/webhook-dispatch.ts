import { createHmac } from "node:crypto";

import { decryptCredentialSecret } from "@/lib/crypto/credential-encryption";
import { prisma } from "@/lib/prisma";

/**
 * Outbound webhook dispatch (T112 Phase 12).
 *
 * When subscribed events fire, delivers signed JSON payloads to partner
 * endpoints. Uses the company's PartnerWebhookSubscription rows.
 *
 * Delivery guarantees:
 * - HMAC-SHA256 signature in `X-HireIQ-Signature` header for verification.
 * - Fire-and-forget: delivery failures are logged but never block the
 *   triggering action. Retry logic is a future ticket.
 */

export class WebhookDispatchError extends Error {}

type WebhookEvent = {
  event: string;
  data: Record<string, unknown>;
  companyId: number;
};

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/** Fire all matching webhook subscriptions for an event. */
export async function dispatchWebhookEvent(
  event: WebhookEvent,
): Promise<void> {
  const subscriptions = await prisma.partnerWebhookSubscription.findMany({
    where: { companyId: event.companyId, active: true },
    select: { id: true, url: true, secretEnc: true },
  });
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    event: event.event,
    timestamp: new Date().toISOString(),
    data: event.data,
  });

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const secret = decryptSecret(sub.secretEnc);
      const signature = signPayload(payload, secret);
      try {
        const res = await fetch(sub.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-HireIQ-Signature": `sha256=${signature}`,
          },
          body: payload,
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          console.error("[webhook-dispatch] non-ok response", {
            subId: sub.id,
            url: sub.url,
            status: res.status,
          });
        }
      } catch (error) {
        console.error("[webhook-dispatch] fetch failed", {
          subId: sub.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
}

function decryptSecret(encrypted: string): string {
  return decryptCredentialSecret(encrypted);
}

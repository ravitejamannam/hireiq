import {
  DistributionProvider,
  ProviderWebhookDeliveryStatus,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/authorization";
import { WebhookDeliveryLedgerError } from "@/lib/jobs/distribution/webhook-delivery";
import { processLinkedInWebhook } from "@/lib/jobs/distribution/linkedin/webhook";
import { readLinkedInWebhookSecret, computeLinkedInWebhookSignature } from "@/lib/jobs/distribution/linkedin/signature";
import { processIndeedWebhook } from "@/lib/jobs/distribution/indeed/webhook";
import { readIndeedApplyWebhookSecret, computeIndeedApplySignature, INDEED_SIGNATURE_HEADER } from "@/lib/jobs/distribution/indeed/signature";

/**
 * Admin triage console for provider webhook deliveries (T96 Phase 3).
 *
 * All functions are ADMIN-only. The replay path re-processes a QUARANTINED
 * delivery's stored raw payload through its provider pipeline. Authenticity
 * was already established at first receipt (signature verified before
 * quarantine), so replay re-signs the stored payload internally with our
 * own secret — no provider round-trip, no trust downgrade.
 */

export type SafeWebhookDelivery = {
  id: number;
  provider: DistributionProvider;
  externalEventId: string | null;
  status: ProviderWebhookDeliveryStatus;
  httpStatus: number;
  signatureValid: boolean;
  payloadSha256: string | null;
  hasPayload: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  receivedAt: Date;
  processedAt: Date | null;
};

type DeliveryRow = Prisma.ProviderWebhookDeliveryGetPayload<{
  select: {
    id: true;
    provider: true;
    externalEventId: true;
    status: true;
    httpStatus: true;
    signatureValid: true;
    payloadRaw: true;
    payloadSha256: true;
    errorCode: true;
    errorMessage: true;
    receivedAt: true;
    processedAt: true;
  };
}>;

function toSafe(row: DeliveryRow): SafeWebhookDelivery {
  return {
    id: row.id,
    provider: row.provider,
    externalEventId: row.externalEventId,
    status: row.status,
    httpStatus: row.httpStatus,
    signatureValid: row.signatureValid,
    payloadSha256: row.payloadSha256,
    hasPayload: row.payloadRaw !== null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    receivedAt: row.receivedAt,
    processedAt: row.processedAt,
  };
}

export async function getWebhookDeliveryHealth() {
  await requireAdmin();

  const rows = await prisma.providerWebhookDelivery.groupBy({
    by: ["status", "provider"],
    _count: { _all: true },
  });

  const health = {
    accepted: 0,
    quarantined: 0,
    rejected: 0,
    byProvider: {} as Record<string, { accepted: number; quarantined: number; rejected: number }>,
  };

  for (const row of rows) {
    const key = row.status.toLowerCase() as "accepted" | "quarantined" | "rejected";
    health[key] += row._count._all;
    const providerKey = row.provider as string;
    health.byProvider[providerKey] ??= { accepted: 0, quarantined: 0, rejected: 0 };
    health.byProvider[providerKey][key] += row._count._all;
  }

  return health;
}

export async function listWebhookDeliveries(input: {
  status?: unknown;
  provider?: unknown;
  take?: unknown;
} = {}) {
  await requireAdmin();

  const statusValues = Object.values(ProviderWebhookDeliveryStatus) as string[];
  const providerValues = Object.values(DistributionProvider) as string[];

  const status =
    typeof input.status === "string" && statusValues.includes(input.status)
      ? (input.status as ProviderWebhookDeliveryStatus)
      : undefined;
  const provider =
    typeof input.provider === "string" && providerValues.includes(input.provider)
      ? (input.provider as DistributionProvider)
      : undefined;
  const take =
    typeof input.take === "number" && Number.isInteger(input.take) && input.take > 0
      ? Math.min(input.take, 200)
      : 50;

  const rows = await prisma.providerWebhookDelivery.findMany({
    where: { status, provider },
    orderBy: { receivedAt: "desc" },
    take,
  });

  return rows.map(toSafe);
}

export async function getWebhookDeliveryForAdmin(id: unknown) {
  await requireAdmin();

  const deliveryId = validateDeliveryId(id);
  const row = await prisma.providerWebhookDelivery.findUnique({
    where: { id: deliveryId },
  });
  if (!row) {
    webhookDeliveryNotFound();
  }

  return {
    ...toSafe(row),
    // Raw payload only for authentic quarantined deliveries.
    payloadRaw:
      row.status === ProviderWebhookDeliveryStatus.QUARANTINED
        ? row.payloadRaw
        : null,
  };
}

export class WebhookReplayError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Re-process a quarantined delivery through its provider pipeline.
 * On success the ledger row is promoted to ACCEPTED with the resolved
 * external event id. On failure it remains QUARANTINED with refreshed
 * error metadata. Never throws for provider-side rejections — those are
 * outcomes, not bugs.
 */
/**
 * Replay a quarantined INBOUND provider delivery.
 * NOTE: ProviderWebhookDelivery rows are global infrastructure events
 * (job-board -> HireIQ); they carry no company dimension, so this
 * intentionally scopes by ADMIN ROLE ONLY, not by tenant.
 */
export async function replayQuarantinedDeliveryForAdmin(id: unknown) {
  const admin = await requireAdmin();
  void admin;

  const deliveryId = validateDeliveryId(id);
  const row = await prisma.providerWebhookDelivery.findUnique({
    where: { id: deliveryId },
  });

  if (!row) {
    webhookDeliveryNotFound();
  }
  if (row.status !== ProviderWebhookDeliveryStatus.QUARANTINED) {
    throw new WebhookReplayError(
      "Only quarantined deliveries can be replayed.",
      "REPLAY_NOT_QUARANTINED",
    );
  }
  if (!row.payloadRaw) {
    throw new WebhookReplayError(
      "Quarantined delivery has no stored payload to replay.",
      "REPLAY_NO_PAYLOAD",
    );
  }

  try {
    if (row.provider === DistributionProvider.LINKEDIN) {
      const secret = readLinkedInWebhookSecret();
      if (!secret) {
        throw new WebhookReplayError(
          "LinkedIn webhook is not configured.",
          "LINKEDIN_WEBHOOK_UNCONFIGURED",
        );
      }
      const result = await processLinkedInWebhook({
        rawBody: row.payloadRaw,
        signature: computeLinkedInWebhookSignature(row.payloadRaw, secret),
      });
      return await promoteDelivery(row.id, result.event.externalApplicationId ?? null);
    }

    if (row.provider === DistributionProvider.INDEED) {
      const secret = readIndeedApplyWebhookSecret();
      if (!secret) {
        throw new WebhookReplayError(
          "Indeed webhook is not configured.",
          "INDEED_WEBHOOK_UNCONFIGURED",
        );
      }
      void INDEED_SIGNATURE_HEADER;
      const result = await processIndeedWebhook({
        rawBody: row.payloadRaw,
        signature: computeIndeedApplySignature(row.payloadRaw, secret),
      });
      return await promoteDelivery(row.id, result.event.externalApplicationId ?? null);
    }

    throw new WebhookReplayError(
      "Unsupported provider for replay.",
      "REPLAY_UNSUPPORTED_PROVIDER",
    );
  } catch (error) {
    if (error instanceof WebhookReplayError) throw error;

    const message = error instanceof Error ? error.message : "Replay failed.";
    await prisma.providerWebhookDelivery.update({
      where: { id: row.id },
      data: {
        errorMessage: message,
        processedAt: new Date(),
      },
    });
    return {
      ok: false as const,
      error: message,
    };
  }
}

async function promoteDelivery(deliveryId: number, externalEventId: string | null) {
  const updated = await prisma.providerWebhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: ProviderWebhookDeliveryStatus.ACCEPTED,
      externalEventId,
      httpStatus: 200,
      errorCode: null,
      errorMessage: null,
      processedAt: new Date(),
    },
  });
  return { ok: true as const, delivery: toSafe(updated) };
}

function validateDeliveryId(id: unknown): number {
  if (typeof id === "number" && Number.isInteger(id) && id > 0) return id;
  if (typeof id === "string" && /^\d+$/.test(id)) {
    const parsed = Number.parseInt(id, 10);
    if (parsed > 0) return parsed;
  }
  throw new WebhookDeliveryLedgerError("INVALID_DELIVERY_ID");
}

function webhookDeliveryNotFound(): never {
  throw new WebhookReplayError("Webhook delivery not found.", "DELIVERY_NOT_FOUND");
}

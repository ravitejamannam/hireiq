import {
  DistributionProvider,
  ProviderWebhookDeliveryStatus,
} from "@prisma/client";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Provider webhook delivery ledger (T96 Phase 2).
 *
 * Guarantees:
 * - Every delivery attempt is durably recorded BEFORE the HTTP response
 *   is returned, so boards can safely retry on non-2xx.
 * - QUARANTINED deliveries preserve the raw payload (size-capped) for
 *   admin triage and replay after a parser fix — an applicant is never
 *   silently lost to a schema change.
 * - REJECTED (auth failure) deliveries store metadata only; bytes from an
 *   unauthenticated sender are never persisted.
 * - Replay dedup: unique (provider, externalEventId); replays update the
 *   existing row instead of creating duplicates.
 */

const MAX_QUARANTINE_PAYLOAD_BYTES = 32 * 1024;

export class WebhookDeliveryLedgerError extends Error {}

type DeliveryInput = {
  provider: DistributionProvider;
  externalEventId: string | null;
  status: ProviderWebhookDeliveryStatus;
  httpStatus: number;
  signatureValid: boolean;
  /** Only pass raw payload for QUARANTINED authentic deliveries. */
  rawPayload?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

function capRawPayload(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const bytes = Buffer.byteLength(raw, "utf8");
  if (bytes <= MAX_QUARANTINE_PAYLOAD_BYTES) return raw;
  return Buffer.from(raw, "utf8").subarray(0, MAX_QUARANTINE_PAYLOAD_BYTES).toString("utf8");
}

export async function recordWebhookDelivery(input: DeliveryInput) {
  const payloadRaw =
    input.status === ProviderWebhookDeliveryStatus.QUARANTINED
      ? capRawPayload(input.rawPayload)
      : null;

  const base = {
    provider: input.provider,
    status: input.status,
    httpStatus: input.httpStatus,
    signatureValid: input.signatureValid,
    payloadRaw,
    payloadSha256: payloadRaw
      ? createHash("sha256").update(payloadRaw, "utf8").digest("hex")
      : null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    processedAt: new Date(),
  };

  try {
    if (input.externalEventId) {
      // Replay dedup: one row per (provider, externalEventId); replays update.
      return await prisma.providerWebhookDelivery.upsert({
        where: {
          provider_externalEventId: {
            provider: input.provider,
            externalEventId: input.externalEventId,
          },
        },
        create: { ...base, externalEventId: input.externalEventId },
        update: { ...base, externalEventId: input.externalEventId },
      });
    }

    // Unparseable payload without a stable id: record as-is for triage.
    return await prisma.providerWebhookDelivery.create({
      data: { ...base, externalEventId: null },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Raced replay: the first delivery already owns the row.
      return prisma.providerWebhookDelivery.findUnique({
        where: {
          provider_externalEventId: {
            provider: input.provider,
            externalEventId: input.externalEventId!,
          },
        },
      });
    }
    throw error;
  }
}

export function classifyProviderWebhookOutcome(error: unknown): {
  status: ProviderWebhookDeliveryStatus;
  errorCode: string;
} {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  if (code.endsWith("_INVALID_SIGNATURE") || code.endsWith("_UNCONFIGURED")) {
    return {
      status: ProviderWebhookDeliveryStatus.REJECTED,
      errorCode: code || "WEBHOOK_AUTH_FAILURE",
    };
  }

  return {
    status: ProviderWebhookDeliveryStatus.QUARANTINED,
    errorCode: code || "WEBHOOK_PROCESSING_FAILED",
  };
}

import { NextResponse } from "next/server";

import {
  DistributionProvider,
  ProviderWebhookDeliveryStatus,
} from "@prisma/client";

import {
  classifyProviderWebhookOutcome,
  recordWebhookDelivery,
} from "@/lib/jobs/distribution/webhook-delivery";

import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForIp,
} from "@/lib/auth/rate-limit";
import {
  LinkedInWebhookError,
  processLinkedInWebhook,
  extractLinkedInExternalEventId,
} from "@/lib/jobs/distribution/linkedin/webhook";
import { LINKEDIN_SIGNATURE_HEADER } from "@/lib/jobs/distribution/linkedin/signature";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

function ipFromRequest(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let rawBody = "";

  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return json({ ok: false, error: "Payload too large." }, 413);
    }

    const ip = ipFromRequest(request);
    await consumeAuthRateLimit({
      name: "linkedinWebhookIp",
      key: rateLimitKeyForIp(ip),
    });

    rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return json({ ok: false, error: "Payload too large." }, 413);
    }

    const result = await processLinkedInWebhook({
      rawBody,
      signature: request.headers.get(LINKEDIN_SIGNATURE_HEADER),
    });
    await recordWebhookDelivery({
      provider: DistributionProvider.LINKEDIN,
      externalEventId: result.event.externalApplicationId ?? null,
      status: ProviderWebhookDeliveryStatus.ACCEPTED,
      httpStatus: 200,
      signatureValid: true,
    });

    console.info("[linkedin-webhook]", {
      ok: true,
      durationMs: Date.now() - startedAt,
    });

    return json({ ok: true }, 200);
  } catch (error) {
    if (!(error instanceof RateLimitError)) {
      const outcome = classifyProviderWebhookOutcome(error);
      const httpStatus =
        typeof error === "object" && error !== null && "httpStatus" in error
          ? Number((error as { httpStatus: unknown }).httpStatus)
          : 500;
      const signatureValid = !(
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        String((error as { code: unknown }).code).endsWith("_INVALID_SIGNATURE")
      );
      await recordWebhookDelivery({
        provider: DistributionProvider.LINKEDIN,
        externalEventId: extractLinkedInExternalEventId(rawBody),
        status: outcome.status,
        httpStatus: Number.isFinite(httpStatus) ? httpStatus : 500,
        signatureValid,
        rawPayload: outcome.status === ProviderWebhookDeliveryStatus.QUARANTINED ? rawBody : null,
        errorCode: outcome.errorCode,
        errorMessage: error instanceof Error ? error.message : null,
      });
    }
    if (error instanceof RateLimitError) {
      return json({ ok: false, error: error.message }, 429);
    }

    if (error instanceof LinkedInWebhookError) {
      console.info("[linkedin-webhook]", {
        ok: false,
        durationMs: Date.now() - startedAt,
        code: error.code,
      });
      return json({ ok: false, error: error.message }, error.httpStatus);
    }

    console.info("[linkedin-webhook]", {
      ok: false,
      durationMs: Date.now() - startedAt,
    });
    return json({ ok: false, error: "Webhook failed." }, 500);
  }
}

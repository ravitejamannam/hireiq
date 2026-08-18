import { NextResponse } from "next/server";

import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForIp,
} from "@/lib/auth/rate-limit";
import {
  IndeedWebhookError,
  processIndeedWebhook,
} from "@/lib/jobs/distribution/indeed/webhook";
import { INDEED_SIGNATURE_HEADER } from "@/lib/jobs/distribution/indeed/signature";

export const dynamic = "force-dynamic";

/**
 * Process/framework cap only. Indeed Apply documents no payload maximum.
 * Not LinkedIn's 32 KiB limit. Resume bytes are discarded after parse.
 */
const MAX_BODY_BYTES = 5 * 1024 * 1024;
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

  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return json({ ok: false, error: "Payload too large." }, 413);
    }

    const ip = ipFromRequest(request);
    await consumeAuthRateLimit({
      name: "indeedWebhookIp",
      key: rateLimitKeyForIp(ip),
    });

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return json({ ok: false, error: "Payload too large." }, 413);
    }

    await processIndeedWebhook({
      rawBody,
      signature: request.headers.get(INDEED_SIGNATURE_HEADER),
    });

    console.info("[indeed-webhook]", {
      ok: true,
      durationMs: Date.now() - startedAt,
    });

    return json({ ok: true }, 200);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return json({ ok: false, error: error.message }, 429);
    }

    if (error instanceof IndeedWebhookError) {
      console.info("[indeed-webhook]", {
        ok: false,
        durationMs: Date.now() - startedAt,
        code: error.code,
      });
      return json({ ok: false, error: error.message }, error.httpStatus);
    }

    console.info("[indeed-webhook]", {
      ok: false,
      durationMs: Date.now() - startedAt,
    });
    return json({ ok: false, error: "Webhook failed." }, 500);
  }
}

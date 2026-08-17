import { NextResponse } from "next/server";

import {
  APPLY_LINK_UNAVAILABLE,
  HOSTED_APPLY_GENERIC_FAILURE,
  HostedApplyError,
  HostedApplyValidationError,
} from "@/lib/apply/hosted-apply-errors";
import { submitHostedApply } from "@/lib/apply/hosted-apply-service";
import { isAllowedApplyOrigin } from "@/lib/apply/same-origin";
import { hashSecureToken } from "@/lib/auth/secure-token";
import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForDigest,
  rateLimitKeyForIp,
} from "@/lib/auth/rate-limit";
import { validatePublicApplyToken } from "@/lib/validation/hosted-apply-validation";

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

function json(
  body: unknown,
  status: number,
) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const startedAt = Date.now();
  const { token } = await context.params;

  try {
    if (!isAllowedApplyOrigin(request)) {
      return json({ success: false, error: APPLY_LINK_UNAVAILABLE }, 403);
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return json(
        {
          success: false,
          errors: { form: "Application details are too large." },
        },
        400,
      );
    }

    const ip = ipFromRequest(request);
    await consumeAuthRateLimit({
      name: "hostedApplyPostIp",
      key: rateLimitKeyForIp(ip),
    });

    const parsedToken = validatePublicApplyToken(token);
    if (parsedToken) {
      await consumeAuthRateLimit({
        name: "hostedApplyPostTokenIp",
        key: rateLimitKeyForDigest("tokenip", `${hashSecureToken(parsedToken)}:${ip}`),
      });
    }

    const body = (await request.json().catch(() => null)) as unknown;

    const result = await submitHostedApply({
      token,
      idempotencyKey: request.headers.get("idempotency-key"),
      body,
    });

    console.info("[hosted-apply] submit", {
      ok: true,
      durationMs: Date.now() - startedAt,
    });

    return json(result, 200);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return json({ success: false, error: error.message }, 429);
    }

    if (error instanceof HostedApplyValidationError) {
      return json(
        { success: false, error: error.message, errors: error.fields },
        400,
      );
    }

    if (error instanceof HostedApplyError) {
      const status = error.code === "CLOSED" ? 410 : 404;
      return json({ success: false, error: error.message }, status);
    }

    console.info("[hosted-apply] submit", {
      ok: false,
      durationMs: Date.now() - startedAt,
    });

    return json({ success: false, error: HOSTED_APPLY_GENERIC_FAILURE }, 500);
  }
}

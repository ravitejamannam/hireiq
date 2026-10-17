import { NextResponse } from "next/server";

import { isAllowedApplyOrigin } from "@/lib/apply/same-origin";
import {
  HostedResumeError,
  storePendingHostedResume,
} from "@/lib/apply/hosted-resume-service";
import { hashSecureToken } from "@/lib/auth/secure-token";
import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForDigest,
  rateLimitKeyForIp,
} from "@/lib/auth/rate-limit";
import { validatePublicApplyToken } from "@/lib/validation/hosted-apply-validation";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

function ipFromRequest(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * POST /api/apply/[token]/resume — PUBLIC multipart pre-upload.
 * Returns a one-time resumeClaim presented with the final application.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    if (!isAllowedApplyOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Unavailable." }, { status: 403, headers: NO_STORE });
    }

    await consumeAuthRateLimit({
      name: "hostedApplyPostIp",
      key: rateLimitKeyForIp(ipFromRequest(request)),
    });

    const { token } = await context.params;
    const parsedToken = validatePublicApplyToken(token);
    if (parsedToken) {
      await consumeAuthRateLimit({
        name: "hostedApplyPostTokenIp",
        key: rateLimitKeyForDigest("resumetokenip", `${hashSecureToken(parsedToken)}:${ipFromRequest(request)}`),
      });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "A resume file is required." }, { status: 400, headers: NO_STORE });
    }

    const result = await storePendingHostedResume({
      applyTokenRaw: token,
      fileName: file.name,
      contentType: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });

    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 429, headers: NO_STORE });
    }
    if (error instanceof HostedResumeError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: 400, headers: NO_STORE });
    }
    console.error("[hosted-resume] upload failed", error);
    return NextResponse.json({ ok: false, error: "UPLOAD_FAILED" }, { status: 500, headers: NO_STORE });
  }
}

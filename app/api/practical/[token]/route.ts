import { NextResponse } from "next/server";

import { isAllowedApplyOrigin } from "@/lib/apply/same-origin";
import { consumeAuthRateLimit, RateLimitError, rateLimitKeyForDigest, rateLimitKeyForIp } from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";
import { hashSecureToken } from "@/lib/auth/secure-token";
import { PracticalError, submitPractical } from "@/lib/screening/practical-service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const STATUS: Record<PracticalError["code"], number> = { UNAVAILABLE: 404, SUBMITTED: 409, OVERDUE: 410, INVALID: 400 };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  try {
    if (!isAllowedApplyOrigin(request)) return json({ ok: false, error: "This practical is unavailable." }, 403);
    const ip = await readRequestIp();
    await consumeAuthRateLimit({ name: "assessmentPostIp", key: rateLimitKeyForIp(ip) });
    await consumeAuthRateLimit({
      name: "assessmentPostTokenIp",
      key: rateLimitKeyForDigest("practical", `${hashSecureToken(token)}:${ip}`),
    });
    const payload = (await request.json().catch(() => null)) as unknown;
    const result = await submitPractical(token, payload);
    return json({ ok: true, submittedAt: result.submittedAt });
  } catch (error) {
    if (error instanceof RateLimitError) return json({ ok: false, error: error.message }, 429);
    if (error instanceof PracticalError) return json({ ok: false, code: error.code, error: error.message }, STATUS[error.code]);
    console.error("[practical] submit failed", error instanceof Error ? error.message : "unknown");
    return json({ ok: false, error: "Submission failed. Nothing was lost; try again." }, 500);
  }
}

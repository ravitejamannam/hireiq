import { NextResponse } from "next/server";

import { isAllowedApplyOrigin } from "@/lib/apply/same-origin";
import {
  GeneratedAssessmentError,
  saveAssessmentProgress,
  startGeneratedAssessment,
  submitGeneratedAssessment,
} from "@/lib/assessments/generated-assessment-service";
import { consumeAuthRateLimit, RateLimitError, rateLimitKeyForDigest, rateLimitKeyForIp } from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";
import { hashSecureToken } from "@/lib/auth/secure-token";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const STATUS: Record<GeneratedAssessmentError["code"], number> = {
  UNAVAILABLE: 404,
  CLOSED: 410,
  SUBMITTED: 409,
  INVALID: 400,
  TIME_UP: 409,
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function failure(error: unknown) {
  if (error instanceof RateLimitError) return json({ ok: false, error: error.message }, 429);
  if (error instanceof GeneratedAssessmentError) return json({ ok: false, code: error.code, error: error.message }, STATUS[error.code]);
  console.error("[assess:generated] request failed", error instanceof Error ? error.message : "unknown");
  return json({ ok: false, error: "Something went wrong. Your saved answers are kept. Try again." }, 500);
}

async function body(request: Request) {
  const parsed = (await request.json().catch(() => null)) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

/** Start the timer or autosave answers. */
export async function PUT(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  try {
    if (!isAllowedApplyOrigin(request)) return json({ ok: false, error: "This assessment is unavailable." }, 403);
    await consumeAuthRateLimit({ name: "assessmentGetIp", key: rateLimitKeyForIp(await readRequestIp()) });
    const payload = await body(request);
    if (payload.action === "start") {
      await startGeneratedAssessment(token);
      return json({ ok: true });
    }
    await saveAssessmentProgress(token, payload.answers, payload.integrity);
    return json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    return failure(error);
  }
}

/** Final submit. Grading happens on the server; the client never sends a score. */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  try {
    if (!isAllowedApplyOrigin(request)) return json({ ok: false, error: "This assessment is unavailable." }, 403);
    const ip = await readRequestIp();
    await consumeAuthRateLimit({ name: "assessmentPostIp", key: rateLimitKeyForIp(ip) });
    await consumeAuthRateLimit({
      name: "assessmentPostTokenIp",
      key: rateLimitKeyForDigest("assessgen", `${hashSecureToken(token)}:${ip}`),
    });
    const payload = await body(request);
    if (payload.answers !== undefined) {
      try {
        await saveAssessmentProgress(token, payload.answers, payload.integrity);
      } catch (error) {
        if (!(error instanceof GeneratedAssessmentError) || error.code !== "TIME_UP") throw error;
      }
    }
    const result = await submitGeneratedAssessment(token, null);
    return json({ ok: true, submitted: result.submitted });
  } catch (error) {
    return failure(error);
  }
}

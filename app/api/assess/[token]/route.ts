import { NextResponse } from "next/server";

import {
  ASSESSMENT_GENERIC_FAILURE,
  ASSESSMENT_UNAVAILABLE,
  AssessmentError,
  AssessmentValidationError,
} from "@/lib/assessments/assessment-errors";
import { submitPublicAssessment } from "@/lib/assessments/assessment-service";
import { isAllowedApplyOrigin } from "@/lib/apply/same-origin";
import { hashSecureToken } from "@/lib/auth/secure-token";
import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForDigest,
  rateLimitKeyForIp,
} from "@/lib/auth/rate-limit";
import { validatePublicAssessmentToken } from "@/lib/assessments/assessment-validation";

export const dynamic = "force-dynamic";

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

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  try {
    if (!isAllowedApplyOrigin(request)) {
      return json({ success: false, error: ASSESSMENT_UNAVAILABLE }, 403);
    }

    const ip = ipFromRequest(request);
    await consumeAuthRateLimit({
      name: "assessmentPostIp",
      key: rateLimitKeyForIp(ip),
    });

    const parsedToken = validatePublicAssessmentToken(token);
    if (parsedToken) {
      await consumeAuthRateLimit({
        name: "assessmentPostTokenIp",
        key: rateLimitKeyForDigest(
          "assessip",
          `${hashSecureToken(parsedToken)}:${ip}`,
        ),
      });
    }

    const body = (await request.json().catch(() => null)) as unknown;
    const payload =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};

    const result = await submitPublicAssessment({
      token,
      answers: payload.answers,
      integrity: payload.integrity,
    });

    return json(result, 200);
  } catch (error) {
    if (!(error instanceof AssessmentValidationError)) {
      console.error("[assess] submission failed", error);
    }
    if (error instanceof RateLimitError) {
      return json({ success: false, error: error.message }, 429);
    }

    if (error instanceof AssessmentValidationError) {
      return json(
        { success: false, error: error.message, errors: error.fields },
        400,
      );
    }

    if (error instanceof AssessmentError) {
      const status =
        error.code === "EXPIRED" ? 410 : error.code === "SUBMITTED" ? 409 : 404;
      return json({ success: false, error: error.message }, status);
    }

    return json({ success: false, error: ASSESSMENT_GENERIC_FAILURE }, 500);
  }
}

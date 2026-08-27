import { NextResponse } from "next/server";

import { resolveCompanyFromApiKey } from "@/lib/api/api-keys";
import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForDigest,
  rateLimitKeyForIp,
} from "@/lib/auth/rate-limit";

const NO_STORE = { "Cache-Control": "no-store" };

export async function requireCompanyFromApiRequest(
  request: Request,
): Promise<
  | { ok: true; companyId: number }
  | { ok: false; response: NextResponse }
> {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";

  try {
    await consumeAuthRateLimit({
      name: "apiKeyIp",
      key: rateLimitKeyForIp(ip),
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "Too many requests." },
          { status: 429, headers: NO_STORE },
        ),
      };
    }
    throw error;
  }

  let companyId: number | null;
  try {
    companyId = await resolveCompanyFromApiKey(
      request.headers.get("authorization"),
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("SECRET_UNCONFIGURED")) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "API keys are not configured on this deployment." },
          { status: 503, headers: NO_STORE },
        ),
      };
    }
    throw error;
  }

  if (!companyId) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Invalid or revoked API key." },
        { status: 401, headers: NO_STORE },
      ),
    };
  }

  try {
    await consumeAuthRateLimit({
      name: "apiKeyToken",
      key: rateLimitKeyForDigest("apiKey", String(companyId)),
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "Too many requests." },
          { status: 429, headers: NO_STORE },
        ),
      };
    }
    throw error;
  }

  return { ok: true, companyId };
}

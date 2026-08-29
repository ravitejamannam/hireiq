import { NextResponse } from "next/server";

import { RateLimitError } from "@/lib/auth/rate-limit";

import { consumeAuthRateLimit, rateLimitKeyForIp } from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";
import { declineOffer } from "@/lib/offers/offer-acceptance";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/offer/[token]/decline — public, hash-verified decline.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  try {
    await consumeAuthRateLimit({
      name: "offerAcceptIp",
      key: rateLimitKeyForIp(await readRequestIp()),
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts." },
        { status: 429, headers: NO_STORE },
      );
    }
    throw error;
  }

  try {
    const result = await declineOffer(token);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      {
        ok: true,
        alreadyDeclined: result.alreadyDeclined,
        declinedAt: result.declinedAt?.toISOString() ?? null,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[offer-decline] failed", error);
    return NextResponse.json(
      { ok: false, error: "Could not record decline." },
      { status: 500, headers: NO_STORE },
    );
  }
}

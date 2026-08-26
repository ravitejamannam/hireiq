import { NextResponse } from "next/server";

import { RateLimitError } from "@/lib/auth/rate-limit";

import { consumeAuthRateLimit, rateLimitKeyForIp } from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";
import { acceptOffer } from "@/lib/offers/offer-acceptance";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/offer/[token]/accept — public, hash-verified acceptance.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  // Audit fix: abuse guard on a public write endpoint.
  try {
    await consumeAuthRateLimit({
      name: "offerAcceptIp",
      key: rateLimitKeyForIp(await readRequestIp()),
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ ok: false, error: "Too many attempts." }, { status: 429, headers: NO_STORE });
    }
    throw error;
  }

  try {
    const result = await acceptOffer(token);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400, headers: NO_STORE });
    }
    return NextResponse.json(
      {
        ok: true,
        alreadyAccepted: result.alreadyAccepted,
        acceptedAt: result.acceptedAt?.toISOString() ?? null,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[offer-accept] failed", error);
    return NextResponse.json({ ok: false, error: "Could not record acceptance." }, { status: 500, headers: NO_STORE });
  }
}

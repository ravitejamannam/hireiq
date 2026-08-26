import { NextResponse } from "next/server";

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

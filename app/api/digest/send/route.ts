import { NextResponse } from "next/server";

import { bearerCronSecretMatches } from "@/lib/auth/cron-auth";
import { sendRecruiterDigest } from "@/lib/digests/recruiter-digest";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/digest/send — trigger the recruiter digest.
 *
 * Authenticated by `Authorization: Bearer $CRON_SECRET`
 * (Vercel Cron sends this header automatically when CRON_SECRET is set).
 */
export async function POST(request: Request) {
  if (!bearerCronSecretMatches(request.headers.get("authorization"))) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Configure CRON_SECRET and call with Bearer token." },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const payload = await sendRecruiterDigest();
    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (error) {
    console.error("[digest] failed", error);
    return NextResponse.json(
      { ok: false, error: "Digest generation failed." },
      { status: 500, headers: NO_STORE },
    );
  }
}

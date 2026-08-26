import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { sendRecruiterDigest } from "@/lib/digests/recruiter-digest";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/digest/send — trigger the recruiter digest.
 *
 * Authenticated either by an admin session (manual trigger) or by a
 * shared CRON_SECRET bearer token (external scheduler, e.g.
 * Vercel Cron / GitHub Actions schedule / cron-job.org).
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization") ?? "";

  // Audit fix: constant-time comparison for the shared secret.
  const expected = `Bearer ${cronSecret ?? ""}`;
  const a = Buffer.from(provided.slice(0, 128));
  const b = Buffer.from(expected.slice(0, 128));
  const secretOk =
    Boolean(cronSecret) && a.length === b.length && timingSafeEqual(a, b);
  if (!secretOk) {
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

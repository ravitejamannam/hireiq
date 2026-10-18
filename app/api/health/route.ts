import { NextResponse } from "next/server";

import { consumeAuthRateLimit, rateLimitKeyForIp, RateLimitError } from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";
import { getProductionEnvProblems } from "@/lib/production/assert-env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await consumeAuthRateLimit({ name: "healthIp", key: rateLimitKeyForIp(await readRequestIp()) });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ ok: false }, { status: 429, headers: { "Cache-Control": "no-store" } });
    }
    throw error;
  }
  const problems = getProductionEnvProblems();
  if (problems.length > 0) {
    return NextResponse.json(
      { ok: false, problems },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

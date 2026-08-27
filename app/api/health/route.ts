import { NextResponse } from "next/server";

import { getProductionEnvProblems } from "@/lib/production/assert-env";

export const dynamic = "force-dynamic";

export async function GET() {
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

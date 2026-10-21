import { NextResponse } from "next/server";

import { bearerCronSecretMatches } from "@/lib/auth/cron-auth";
import { reportError } from "@/lib/obs/report-error";
import { retryIncompleteErasures } from "@/lib/privacy/candidate-erasure";
import { runRetention } from "@/lib/privacy/retention-worker";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST/GET /api/ops/retention — retention dry-run report plus a retry of erasures that did not finish.
 * Expiry is never executed from this route in this release: it always runs dry-run. With no customer
 * retention rules configured the report shows NO_POLICY for every category and nothing is eligible.
 * The retry only repeats erasures that were already requested (admin request or deletion queue).
 * Authorize with `Authorization: Bearer $CRON_SECRET`. The response holds counts only.
 */
export async function POST(request: Request) {
  if (!bearerCronSecretMatches(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized. Configure CRON_SECRET." }, { status: 401, headers: NO_STORE });
  }
  try {
    const erasureRetry = await retryIncompleteErasures();
    const report = await runRetention({ mode: "dry-run" });
    if (erasureRetry.stillPartial > 0 || report.totals.failed > 0) {
      reportError("retention", new Error("Erasure or retention steps are failing."), { alert: "retention_failures" });
    }
    return NextResponse.json({ ok: true, erasureRetry, report }, { headers: NO_STORE });
  } catch (error) {
    reportError("retention", error, { alert: "cron_failed", page: true });
    return NextResponse.json({ ok: false, error: "Retention sweep failed." }, { status: 500, headers: NO_STORE });
  }
}

export async function GET(request: Request) {
  return POST(request);
}

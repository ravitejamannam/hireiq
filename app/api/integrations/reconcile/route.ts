import { NextResponse } from "next/server";

import { timingSafeEqual } from "node:crypto";

import { requireAdmin } from "@/lib/auth/authorization";
import { runReconciliationSweep } from "@/lib/jobs/distribution/reconciliation";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/integrations/reconcile
 *
 * Triggers one bounded reconciliation sweep. Authorized via either:
 * 1. An ADMIN session (dashboard "Run now" button), or
 * 2. A cron scheduler presenting `x-cron-secret: RECONCILIATION_SECRET`.
 *
 * Without a configured secret, cron-style invocation fails closed.
 */
function cronSecretMatches(request: Request): boolean {
  const configured = process.env.RECONCILIATION_SECRET?.trim();
  const provided = request.headers.get("x-cron-secret")?.trim();
  if (!configured || !provided) return false;
  return timingSafeEqual(Buffer.from(configured), Buffer.from(provided));
}

export async function POST(request: Request) {
  let authorizedViaSession = false;
  try {
    await requireAdmin();
    authorizedViaSession = true;
  } catch {
    // fall through to cron secret check
  }

  if (!authorizedViaSession && !cronSecretMatches(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const summary = await runReconciliationSweep({ batchSize: 100 });
    return NextResponse.json({ ok: true as const, summary }, { headers: NO_STORE });
  } catch (error) {
    console.error("[reconciliation] sweep failed", error);
    return NextResponse.json(
      { ok: false, error: "Reconciliation sweep failed." },
      { status: 500, headers: NO_STORE },
    );
  }
}

import { NextResponse } from "next/server";

import { bearerCronSecretMatches } from "@/lib/auth/cron-auth";
import { retryPendingOutboundEmails } from "@/lib/communication/email-transport";
import { retryPendingWebhookDeliveries } from "@/lib/interviews/webhook-dispatch";
import { reportError } from "@/lib/obs/report-error";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST/GET /api/ops/cron — retry outbound email and partner webhooks.
 * Authorize with `Authorization: Bearer $CRON_SECRET`.
 * Vercel Cron issues GET; Hobby only allows a daily schedule.
 */
export async function POST(request: Request) {
  if (!bearerCronSecretMatches(request.headers.get("authorization"))) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Configure CRON_SECRET." },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const [email, webhooks] = await Promise.all([
      retryPendingOutboundEmails(),
      retryPendingWebhookDeliveries(),
    ]);
    return NextResponse.json(
      { ok: true, email, webhooks },
      { headers: NO_STORE },
    );
  } catch (error) {
    reportError("ops-cron", error, { alert: "cron_failed", page: true });
    return NextResponse.json(
      { ok: false, error: "Retry sweep failed." },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}

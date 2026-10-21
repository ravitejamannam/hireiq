import { NextResponse } from "next/server";

import { bearerCronSecretMatches } from "@/lib/auth/cron-auth";
import { retryPendingOutboundEmails } from "@/lib/communication/email-transport";
import { retryDueInboundMessages } from "@/lib/inbound/inbound-service";
import { retryDueIndexingNotifications } from "@/lib/jobs/indexing/indexing-queue";
import { retryPendingWebhookDeliveries } from "@/lib/interviews/webhook-dispatch";
import { reportError } from "@/lib/obs/report-error";
import { runWeeklySpotChecks } from "@/lib/screening/spot-checks";
import { sendDueStageReminders } from "@/lib/screening/stage-reminders";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST/GET /api/ops/cron — retry outbound email and partner webhooks, and
 * send one deadline reminder per open assessment or practical, and draw the
 * weekly below-cutoff spot-check sample (once per job per week).
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
    const [email, webhooks, reminders, spotChecks, indexing, inbound] = await Promise.all([
      retryPendingOutboundEmails(),
      retryPendingWebhookDeliveries(),
      sendDueStageReminders().catch((error: unknown) => {
        reportError("stage-reminders", error);
        return { error: "Stage reminder sweep failed." };
      }),
      runWeeklySpotChecks().catch((error: unknown) => {
        reportError("spot-checks", error);
        return { error: "Spot-check sweep failed." };
      }),
      retryDueIndexingNotifications().catch((error: unknown) => {
        reportError("indexing", error);
        return { error: "Indexing notification sweep failed." };
      }),
      retryDueInboundMessages().catch((error: unknown) => {
        reportError("inbound-email", error);
        return { error: "Inbound email retry failed." };
      }),
    ]);
    return NextResponse.json(
      { ok: true, email, webhooks, reminders, spotChecks, indexing, inbound },
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

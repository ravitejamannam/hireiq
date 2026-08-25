import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/authorization";
import { runCalendarSlotSyncForAdmin } from "@/lib/interviews/calendar-sync-service";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/integrations/google/sync — ADMIN: generate OPEN slots for a
 * job from the assigned interviewer's Google calendar free/busy.
 * Body: { jobId, days? }.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const result = await runCalendarSlotSyncForAdmin({
      jobId: body?.jobId,
      days: body?.days,
    });
    return NextResponse.json({ ok: true, created: result.created }, { headers: NO_STORE });
  } catch (error) {
    console.error("[google-sync] failed", error);
    return NextResponse.json({ ok: false, error: "Calendar sync failed." }, { status: 500, headers: NO_STORE });
  }
}

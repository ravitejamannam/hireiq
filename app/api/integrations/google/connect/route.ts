import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/authorization";
import {
  buildGoogleAuthUrl,
  isCalendarSyncConfigured,
} from "@/lib/interviews/calendar-sync-service";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/integrations/google/connect — ADMIN: start the Google OAuth
 * flow. The admin's userId travels in `state` (signed by Google's
 * round-trip) so the callback links the integration to the right account.
 */
export async function GET(request: Request) {
  let adminId: number;
  try {
    const admin = await requireAdmin();
    adminId = admin.id;
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  }

  if (!isCalendarSyncConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET first." },
      { status: 503, headers: NO_STORE },
    );
  }

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(buildGoogleAuthUrl({ userId: adminId, requestOrigin: origin }));
}

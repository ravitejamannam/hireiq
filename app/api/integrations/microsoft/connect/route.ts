import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/authorization";
import { buildMicrosoftAuthUrl, isMicrosoftCalendarConfigured } from "@/lib/interviews/microsoft-calendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let adminId: number;
  try {
    const admin = await requireAdmin();
    adminId = admin.id;
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!isMicrosoftCalendarConfigured()) {
    return NextResponse.json({ ok: false, error: "Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET first." }, { status: 503 });
  }
  return NextResponse.redirect(buildMicrosoftAuthUrl({ userId: adminId, requestOrigin: new URL(request.url).origin }));
}

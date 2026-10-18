import { NextResponse } from "next/server";

import { saveMicrosoftCalendarGrant } from "@/lib/interviews/microsoft-calendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.json({ ok: false, error: "Missing code." }, { status: 400 });
  const session = await fetch(new URL("/api/auth/session", url.origin), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  }).then((response) => response.json()).catch(() => null) as { user?: { id?: string; role?: string } } | null;
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  await saveMicrosoftCalendarGrant({
    userId: Number(session.user.id),
    code,
    requestOrigin: url.origin,
  });
  return NextResponse.redirect(new URL("/dashboard/integrations?microsoft=connected", url.origin));
}

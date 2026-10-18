import { NextResponse } from "next/server";

import { resolveCompanyFromApiKey } from "@/lib/api/api-keys";
import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { capturePublicProfile } from "@/lib/extension/capture";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const companyId = await resolveCompanyFromApiKey(request.headers.get("authorization"));
  if (!companyId) return NextResponse.json({ ok: false, error: "Invalid or revoked API key." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    profileUrl?: string;
    name?: string;
    headline?: string;
    profiles?: unknown;
    userId?: number;
  } | null;
  const captured = capturePublicProfile({
    companyId,
    actorCompanyId: companyId,
    userId: Number(body?.userId ?? 0),
    profileUrl: body?.profileUrl ?? "",
    name: body?.name ?? "",
    headline: body?.headline,
    extraProfiles: body?.profiles,
  });
  if (!captured.ok) return NextResponse.json({ ok: false, error: captured.error }, { status: 400 });
  const row = await prisma.profileCapture.create({ data: captured.draft });
  await writeAuditLog(prisma, { ...captured.audit, targetId: row.id, actorUserId: captured.draft.userId, actorRole: "API" }).catch(() => undefined);
  return NextResponse.json({ ok: true, id: row.id });
}

import { NextResponse } from "next/server";

import { isAllowedApplyOrigin } from "@/lib/apply/same-origin";
import { readHostedResumeParse } from "@/lib/apply/hosted-resume-service";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  if (!isAllowedApplyOrigin(request)) {
    return NextResponse.json({ ok: false }, { status: 403, headers: NO_STORE });
  }
  const { token } = await context.params;
  const claim = new URL(request.url).searchParams.get("claim") ?? "";
  if (!claim) return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE });
  const status = await readHostedResumeParse({ applyTokenRaw: token, resumeClaim: claim });
  if (!status) return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE });
  return NextResponse.json({ ok: true, ...status }, { headers: NO_STORE });
}

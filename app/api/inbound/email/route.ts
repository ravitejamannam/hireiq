import { NextResponse } from "next/server";

import {
  inboundSignatureMatches,
  inboundWebhookSecret,
  parseInboundEvent,
} from "@/lib/inbound/contract";
import { acceptInboundEvent } from "@/lib/inbound/inbound-service";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const secret = inboundWebhookSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Inbound email is not configured." },
      { status: 503, headers: NO_STORE },
    );
  }
  const body = await request.text();
  const signatureOk = inboundSignatureMatches({
    secret,
    timestamp: request.headers.get("x-hireiq-timestamp"),
    body,
    signature: request.headers.get("x-hireiq-signature"),
  });
  if (!signatureOk) {
    return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 401, headers: NO_STORE });
  }
  const parsed = parseInboundEvent(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.code }, { status: 400, headers: NO_STORE });
  }
  const result = await acceptInboundEvent(parsed.event);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.code }, { status: result.httpStatus, headers: NO_STORE });
  }
  return NextResponse.json(
    { ok: true, duplicate: result.duplicate, message: result.message },
    { status: result.httpStatus, headers: NO_STORE },
  );
}

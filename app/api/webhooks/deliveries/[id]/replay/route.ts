import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/authorization";
import { WebhookReplayError, replayQuarantinedDeliveryForAdmin } from "@/lib/jobs/distribution/webhook-delivery-admin";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/webhooks/deliveries/[id]/replay — ADMIN only.
 * Re-processes a quarantined delivery through its provider pipeline.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401, headers: NO_STORE },
    );
  }

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Invalid delivery id." },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const result = await replayQuarantinedDeliveryForAdmin(Number.parseInt(id, 10));
    return NextResponse.json(result, {
      status: result.ok ? 200 : 422,
      headers: NO_STORE,
    });
  } catch (error) {
    if (
      error instanceof WebhookReplayError &&
      (error.code === "DELIVERY_NOT_FOUND" || error.code === "INVALID_DELIVERY_ID")
    ) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404, headers: NO_STORE });
    }
    if (error instanceof WebhookReplayError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409, headers: NO_STORE });
    }
    return NextResponse.json({ ok: false, error: "Replay failed." }, { status: 500, headers: NO_STORE });
  }
}

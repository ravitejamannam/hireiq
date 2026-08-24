import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/authorization";
import {
  ApiTokenError,
  createApiTokenForCompany,
} from "@/lib/api/api-keys";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/v1/tokens — ADMIN: mint an API key for the company.
 * Body: { companyId, name }. The raw key is returned exactly once.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const companyId = Number(body?.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    return NextResponse.json({ ok: false, error: "Valid companyId required." }, { status: 400, headers: NO_STORE });
  }

  try {
    const result = await createApiTokenForCompany({
      companyId,
      name: body?.name,
    });
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ApiTokenError && error.code === "API_KEY_SECRET_UNCONFIGURED") {
      return NextResponse.json(
        { ok: false, error: "API key signing secret not configured." },
        { status: 503, headers: NO_STORE },
      );
    }
    console.error("[api-tokens] create failed", error);
    return NextResponse.json({ ok: false, error: "Failed to create token." }, { status: 500, headers: NO_STORE });
  }
}

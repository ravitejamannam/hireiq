import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/authorization";
import {
  anonymizeCandidateForAdmin,
} from "@/lib/compliance/data-erasure-service";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/candidates/[id]/erase — ADMIN only.
 *
 * GDPR Article 17 right to erasure. Irreversible: scrubs all personal
 * data while preserving the audit trail's structure. Callers must confirm
 * no legal hold applies.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let actorUserId: number;
  let adminCompanyId: number | null;
  try {
    const admin = await requireAdmin();
    actorUserId = admin.id;
    adminCompanyId = admin.companyId;
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  }

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid candidate id." }, { status: 400, headers: NO_STORE });
  }

  try {
    const result = await anonymizeCandidateForAdmin({
      actorUserId,
      candidateIdInput: Number.parseInt(id, 10),
      expectedCompanyId: adminCompanyId ?? undefined,
    });
    // PARTIAL means some steps failed and the retry job will repeat them. Only step names are returned.
    return NextResponse.json({ ok: result.status === "COMPLETED", ...result }, { status: result.status === "COMPLETED" ? 200 : 202, headers: NO_STORE });
  } catch (error) {
    if (error instanceof Error && error.message === "CANDIDATE_NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "Candidate not found." }, { status: 404, headers: NO_STORE });
    }
    console.error("[data-erasure] failed", error);
    return NextResponse.json({ ok: false, error: "Erasure failed." }, { status: 500, headers: NO_STORE });
  }
}

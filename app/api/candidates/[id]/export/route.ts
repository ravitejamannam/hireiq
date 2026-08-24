import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/authorization";
import {
  DataExportError,
  exportCandidateDataForAdmin,
} from "@/lib/compliance/data-export-service";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/candidates/[id]/export — ADMIN only.
 * GDPR Article 15: full data export as a downloadable JSON document.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  }

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid candidate id." }, { status: 400, headers: NO_STORE });
  }

  try {
    const exportData = await exportCandidateDataForAdmin(Number.parseInt(id, 10));
    const fileName = `hireiq-candidate-${id}-data.json`;
    return new NextResponse(JSON.stringify(exportData.json, null, 2), {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    if (error instanceof DataExportError && error.code === "CANDIDATE_NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "Candidate not found." }, { status: 404, headers: NO_STORE });
    }
    console.error("[data-export] failed", error);
    return NextResponse.json({ ok: false, error: "Export failed." }, { status: 500, headers: NO_STORE });
  }
}

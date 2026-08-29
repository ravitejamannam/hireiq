import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/authorization";
import { renderOfferDocumentHtml } from "@/lib/offers/offer-documents";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/applications/[id]/offer-letter — ADMIN only.
 *
 * Returns a print-ready HTML offer letter for a SELECTED or HIRED
 * application. Compensation prefers stored offerCompensation, then
 * expected CTC, then ?ctc=.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let adminCompanyId: number | null;
  try {
    const admin = await requireAdmin();
    adminCompanyId = admin.companyId;
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  }
  if (!adminCompanyId) {
    return NextResponse.json({ ok: false, error: "No workspace." }, { status: 403, headers: NO_STORE });
  }

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid id." }, { status: 400, headers: NO_STORE });
  }

  const application = await prisma.application.findFirst({
    where: { id: Number.parseInt(id, 10), companyId: adminCompanyId },
    select: {
      id: true,
      status: true,
      offerAcceptedAt: true,
      offerTerms: true,
      offerCompensation: true,
      proposedStartDate: true,
      candidate: {
        select: {
          name: true,
          expectedCTC: true,
          location: true,
        },
      },
      job: {
        select: {
          title: true,
          location: true,
          company: { select: { name: true } },
        },
      },
    },
  });

  if (!application) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404, headers: NO_STORE });
  }

  if (!["SELECTED", "HIRED"].includes(application.status)) {
    return NextResponse.json(
      { ok: false, error: "Offer letters are only available for SELECTED or HIRED applications." },
      { status: 409, headers: NO_STORE },
    );
  }

  const url = new URL(request.url);
  const ctcOverride = url.searchParams.get("ctc")?.trim();
  const compensation =
    ctcOverride ||
    application.offerCompensation?.trim() ||
    application.candidate.expectedCTC ||
    "As discussed";

  const html = renderOfferDocumentHtml({
    kind: application.offerAcceptedAt ? "joining" : "offer",
    candidateName: application.candidate.name,
    jobTitle: application.job.title,
    companyName: application.job.company.name,
    location: application.job.location ?? application.candidate.location,
    compensation,
    terms: application.offerTerms,
    proposedStartDate: application.proposedStartDate,
    acceptedAt: application.offerAcceptedAt,
  });

  return new NextResponse(html, {
    status: 200,
    headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" },
  });
}

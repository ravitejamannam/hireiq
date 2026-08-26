import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/applications/[id]/offer-letter — ADMIN only.
 *
 * Returns a print-ready HTML offer letter for a SELECTED or HIRED
 * application. Open in a browser and print to PDF (or use headless
 * Chrome). Compensation defaults to the candidate's expected CTC and
 * can be overridden via ?ctc= query param.
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

  // Tenant guard (audit fix): cross-tenant ids return 404.
  const application = await prisma.application.findFirst({
    where: { id: Number.parseInt(id, 10), companyId: adminCompanyId },
    select: {
      id: true,
      status: true,
      candidate: {
        select: {
          name: true,
          role: true,
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
  const ctc = ctcOverride || application.candidate.expectedCTC || "As discussed";
  const today = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });

  const candidateFirstName = application.candidate.name.split(" ")[0];

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Offer Letter — ${application.candidate.name}</title>
<style>
  @media print { .no-print { display: none; } }
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 720px; margin: 48px auto; padding: 0 24px; color: #18181b; line-height: 1.7; }
  .toolbar { font-family: system-ui, sans-serif; margin-bottom: 32px; padding: 12px; background: #f4f4f5; border-radius: 8px; }
  h1 { font-size: 22px; letter-spacing: 0.05em; text-transform: uppercase; border-bottom: 2px solid #18181b; padding-bottom: 12px; }
  .meta { margin: 24px 0; }
  table.terms { width: 100%; border-collapse: collapse; margin: 24px 0; font-family: system-ui, sans-serif; font-size: 14px; }
  table.terms td { border: 1px solid #d4d4d8; padding: 10px 14px; }
  table.terms td:first-child { background: #fafafa; font-weight: 600; width: 40%; }
  .signature { margin-top: 64px; display: flex; justify-content: space-between; }
  .signature div { width: 45%; border-top: 1px solid #18181b; padding-top: 8px; font-size: 13px; }
</style>
</head>
<body>
  <div class="toolbar no-print">
    Print this page (Ctrl/Cmd + P) to save as PDF.
    ${application.candidate.expectedCTC && !ctcOverride ? `<br />Compensation defaulted to candidate expectation (${application.candidate.expectedCTC}). Override with <code>?ctc=...</code>.` : ""}
  </div>

  <h1>Offer of Employment</h1>

  <p class="meta">
    ${today}<br /><br />
    <strong>${application.candidate.name}</strong><br />
    ${application.candidate.location ?? ""}
  </p>

  <p>Dear ${candidateFirstName},</p>

  <p>
    We are delighted to extend an offer for the position of
    <strong>${application.job.title}</strong> at
    <strong>${application.job.company.name}</strong>.
    Following your interviews and assessment, we believe you will be a
    valuable addition to our team.
  </p>

  <table class="terms">
    <tr><td>Position</td><td>${application.job.title}</td></tr>
    <tr><td>Company</td><td>${application.job.company.name}</td></tr>
    <tr><td>Work location</td><td>${application.job.location ?? application.candidate.location ?? "To be confirmed"}</td></tr>
    <tr><td>Compensation</td><td>${ctc}</td></tr>
    <tr><td>Offer date</td><td>${today}</td></tr>
  </table>

  <p>
    This offer is contingent upon standard background verification and
    execution of customary onboarding documents. Please sign below to
    confirm acceptance.
  </p>

  <p>We look forward to welcoming you to the team.</p>

  <p>Sincerely,<br /><br />
  The Hiring Team<br />
  ${application.job.company.name}</p>

  <div class="signature">
    <div>Candidate signature &amp; date</div>
    <div>Authorised signatory</div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" },
  });
}

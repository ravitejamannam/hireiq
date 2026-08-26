import { NextResponse } from "next/server";

import { resolveCompanyFromApiKey } from "@/lib/api/api-keys";
import { addSourcedCandidateForCompany } from "@/lib/candidates/sourced-intake";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/v1/sourced-candidates — machine ingestion for sourced
 * candidates (Chrome extension, enrichment pipelines).
 *
 * Bearer API key required. Delegates to the SAME service as the admin
 * UI path (audit fix: the previous inline duplicate silently skipped
 * MANUAL provenance events, breaking stage-change emails for
 * extension-sourced candidates).
 */
export async function POST(request: Request) {
  let companyId: number | null;
  try {
    companyId = await resolveCompanyFromApiKey(request.headers.get("authorization"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("SECRET_UNCONFIGURED")) {
      return NextResponse.json({ ok: false, error: "API keys not configured." }, { status: 503, headers: NO_STORE });
    }
    throw error;
  }
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Invalid or revoked API key." }, { status: 401, headers: NO_STORE });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "JSON body required." }, { status: 400, headers: NO_STORE });
  }

  const result = await addSourcedCandidateForCompany({
    companyId,
    jobId: Number(body.jobId),
    name: typeof body.name === "string" ? body.name : "",
    email: typeof body.email === "string" ? body.email : undefined,
    skills: typeof body.skills === "string" ? body.skills : undefined,
    experienceYears: Number.isFinite(Number(body.experienceYears))
      ? Number(body.experienceYears)
      : undefined,
    location: typeof body.location === "string" ? body.location : undefined,
    currentEmployer:
      typeof body.currentEmployer === "string" ? body.currentEmployer : undefined,
    source: body.source === "NAUKRI" ? "NAUKRI" : body.source === "LINKEDIN" ? "LINKEDIN" : ("" as never),
  });

  if (!result.ok) {
    const status = /not found/i.test(result.error) ? 404 : /invalid|required/i.test(result.error) ? 400 : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status, headers: NO_STORE });
  }
  return NextResponse.json(
    { ok: result.ok, applicationId: result.applicationId, candidateId: result.candidateId, reusedCandidate: result.reusedCandidate },
    { headers: NO_STORE },
  );
}

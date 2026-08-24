import { NextResponse } from "next/server";

import { resolveCompanyFromApiKey } from "@/lib/api/api-keys";
import { listPublicFeedJobs } from "@/lib/jobs/public-feed/public-feed-service";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/v1/jobs — public API v0 (T112).
 *
 * Bearer API key required. Returns the company's published hosted-apply
 * roles in a clean JSON shape — the seed of the developer ecosystem.
 */
export async function GET(request: Request) {
  let companyId: number | null;
  try {
    companyId = await resolveCompanyFromApiKey(request.headers.get("authorization"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("SECRET_UNCONFIGURED")) {
      return NextResponse.json(
        { ok: false, error: "API keys are not configured on this deployment." },
        { status: 503, headers: NO_STORE },
      );
    }
    throw error;
  }
  if (!companyId) {
    return NextResponse.json(
      { ok: false, error: "Invalid or revoked API key." },
      { status: 401, headers: NO_STORE },
    );
  }

  const jobs = await listPublicFeedJobs(companyId);

  return NextResponse.json(
    {
      ok: true,
      count: jobs.length,
      jobs: jobs.map((job) => ({
        id: job.externalRef,
        title: job.title,
        companyName: job.companyName,
        location: job.location,
        description: job.description,
        applyUrl: job.applyUrl,
        postedAt: job.datePosted.toISOString(),
      })),
    },
    { headers: NO_STORE },
  );
}

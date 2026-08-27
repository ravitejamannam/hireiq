import { NextResponse } from "next/server";

import { requireCompanyFromApiRequest } from "@/lib/api/require-company-from-request";
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
  const auth = await requireCompanyFromApiRequest(request);
  if (!auth.ok) return auth.response;
  const { companyId } = auth;

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

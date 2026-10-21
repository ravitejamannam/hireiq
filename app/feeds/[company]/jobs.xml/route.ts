import { NextResponse } from "next/server";

import { isValidPublicSlug } from "@/lib/companies/public-slug";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { jobsFeedXml } from "@/lib/jobs/public-feed/company-feed";
import { listPublicFeedJobs } from "@/lib/jobs/public-feed/public-feed-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  context: { params: Promise<{ company: string }> },
) {
  const { company: slug } = await context.params;
  if (!isValidPublicSlug(slug)) {
    return new NextResponse("Feed not found.", { status: 404, headers: NO_STORE });
  }

  const company = await prisma.company.findUnique({
    where: { publicSlug: slug },
    select: { id: true, name: true, jobsFeedEnabled: true },
  });
  if (!company || !company.jobsFeedEnabled) {
    return new NextResponse("This company feed is not enabled.", {
      status: 404,
      headers: NO_STORE,
    });
  }

  const origin = getPublicAppUrl() ?? "";
  const jobs = await listPublicFeedJobs(company.id);
  const body = jobsFeedXml({ companyName: company.name, origin, jobs });
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      ...NO_STORE,
    },
  });
}

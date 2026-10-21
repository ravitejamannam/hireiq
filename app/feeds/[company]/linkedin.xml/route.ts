import { NextResponse } from "next/server";

import { isValidPublicSlug } from "@/lib/companies/public-slug";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import {
  linkedInFeedConfigurationError,
  linkedInFeedXml,
} from "@/lib/jobs/public-feed/company-feed";
import { publicCompanyJobsPath } from "@/lib/jobs/public-feed/public-job-slug";
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
    select: {
      id: true,
      name: true,
      publicSlug: true,
      linkedInFeedEnabled: true,
      linkedInCompanyId: true,
      linkedInPosterEmail: true,
    },
  });
  if (!company) {
    return new NextResponse("Feed not found.", { status: 404, headers: NO_STORE });
  }

  const origin = getPublicAppUrl();
  const configError = linkedInFeedConfigurationError({
    enabled: company.linkedInFeedEnabled,
    companyId: company.linkedInCompanyId,
    posterEmail: company.linkedInPosterEmail,
    companyName: company.name,
    publisherUrl: origin ? `${origin}${publicCompanyJobsPath(company.publicSlug)}` : "",
  });
  if (configError === "disabled" || !company.linkedInFeedEnabled) {
    return new NextResponse("This LinkedIn feed is not enabled.", {
      status: 404,
      headers: NO_STORE,
    });
  }
  if (configError) {
    return new NextResponse(
      "LinkedIn feed configuration is incomplete. A company ID, poster email, and public site URL are required. This is not LinkedIn approval.",
      { status: 422, headers: NO_STORE },
    );
  }

  const jobs = await listPublicFeedJobs(company.id);
  const body = linkedInFeedXml({
    config: {
      enabled: true,
      companyId: company.linkedInCompanyId,
      posterEmail: company.linkedInPosterEmail,
      companyName: company.name,
      publisherUrl: `${origin}${publicCompanyJobsPath(company.publicSlug)}`,
    },
    jobs,
    generatedAt: new Date(),
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      ...NO_STORE,
    },
  });
}

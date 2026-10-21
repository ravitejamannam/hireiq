import type { MetadataRoute } from "next";

import { getPublicAppUrl } from "@/lib/communication/email-config";
import { publicCompanyJobsPath, publicJobPath } from "@/lib/jobs/public-feed/public-job-slug";
import { listAllPublicFeedJobs } from "@/lib/jobs/public-feed/public-feed-service";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getPublicAppUrl();
  if (!origin) return [];

  const jobs = await listAllPublicFeedJobs();
  const companies = new Map<string, string>();
  const entries: MetadataRoute.Sitemap = [];

  for (const job of jobs) {
    companies.set(job.companyPublicSlug, job.companyName);
    entries.push({
      url: `${origin}${publicJobPath(job.companyPublicSlug, job.title, job.distributionId)}`,
      lastModified: job.datePosted,
      changeFrequency: "daily",
    });
  }

  for (const slug of companies.keys()) {
    entries.push({
      url: `${origin}${publicCompanyJobsPath(slug)}`,
      changeFrequency: "daily",
    });
  }

  return entries;
}

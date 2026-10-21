import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicJobArticle } from "@/components/careers/PublicJobArticle";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { displayJobTitle } from "@/lib/jobs/job-posting-view";
import { getPublicJobByDistributionId } from "@/lib/jobs/public-feed/public-feed-service";
import {
  companySlugMatches,
  distributionIdFromPublicSlug,
  publicJobPath,
} from "@/lib/jobs/public-feed/public-job-slug";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ company: string; slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { company, slug } = await params;
  const id = distributionIdFromPublicSlug(slug);
  const job = id ? await getPublicJobByDistributionId(id) : null;
  if (!job || !companySlugMatches(company, job.companyPublicSlug)) {
    return { title: "Job not found" };
  }
  const title = displayJobTitle(job.title, job.companyName);
  return {
    title: `${title} — ${job.companyName}`,
    description: job.description.slice(0, 160),
    robots: { index: true, follow: true },
  };
}

export default async function CompanyJobPage({ params }: PageProps) {
  const { company, slug } = await params;
  const id = distributionIdFromPublicSlug(slug);
  const job = id ? await getPublicJobByDistributionId(id) : null;
  if (!job || !companySlugMatches(company, job.companyPublicSlug)) {
    notFound();
  }

  const origin = getPublicAppUrl();
  const postingUrl = origin
    ? `${origin}${publicJobPath(job.companyPublicSlug, job.title, job.distributionId)}`
    : null;

  return <PublicJobArticle job={job} postingUrl={postingUrl} />;
}

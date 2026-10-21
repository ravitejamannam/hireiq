import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicJobArticle } from "@/components/careers/PublicJobArticle";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { displayJobTitle } from "@/lib/jobs/job-posting-view";
import { getPublicJobByDistributionId } from "@/lib/jobs/public-feed/public-feed-service";
import { publicJobPath } from "@/lib/jobs/public-feed/public-job-slug";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ distributionId: string }>;
};

function isValidDistributionId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number.parseInt(value, 10);
  return id > 0 ? id : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { distributionId } = await params;
  const id = isValidDistributionId(distributionId);
  if (!id) return { title: "Job not found" };

  const job = await getPublicJobByDistributionId(id);
  if (!job) return { title: "Job not found" };

  const title = displayJobTitle(job.title, job.companyName);

  return {
    title: `${title} — ${job.companyName}`,
    description: job.description.slice(0, 160),
    robots: { index: true, follow: true },
  };
}

/**
 * Public job landing page (T96 Phase 1).
 *
 * Exposure contract: renders ONLY data from a PUBLISHED HIREIQ_HOSTED
 * distribution and its pinned published specification. No candidate data,
 * no recruiter data, no internal tenant configuration. The apply CTA links
 * to the distribution's hosted-apply URL; token-scoped security remains in
 * the hosted-apply flow itself.
 */
export default async function PublicJobPage({ params }: PageProps) {
  const { distributionId } = await params;
  const id = isValidDistributionId(distributionId);
  const job = id ? await getPublicJobByDistributionId(id) : null;

  if (!job) {
    notFound();
  }

  const origin = getPublicAppUrl();
  const postingUrl = origin
    ? `${origin}${publicJobPath(job.companyPublicSlug, job.title, job.distributionId)}`
    : null;

  return <PublicJobArticle job={job} postingUrl={postingUrl} />;
}

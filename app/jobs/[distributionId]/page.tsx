import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { hostedApplyPathFromSnapshot } from "@/lib/apply/hosted-apply-url";
import { displayJobTitle } from "@/lib/jobs/job-posting-view";
import { getPublicJobByDistributionId } from "@/lib/jobs/public-feed/public-feed-service";

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

  const title = displayJobTitle(job.title, job.companyName);

  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title,
    description: `<p>${job.description.replaceAll("\n", "</p><p>")}</p>`,
    datePosted: job.datePosted.toISOString(),
    ...(job.validThrough ? { validThrough: job.validThrough.toISOString() } : {}),
    hiringOrganization: { "@type": "Organization", name: job.companyName },
    ...(job.location
      ? {
          jobLocation: {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressLocality: job.location },
          },
        }
      : {}),
    directApply: true,
    url: job.applyUrl,
  };

  const applyHref =
    hostedApplyPathFromSnapshot(job.applyUrl) ?? job.applyUrl;

  return (
    <main className="min-h-screen bg-[#F7F4EE] text-zinc-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="mx-auto max-w-3xl px-6 py-12">
        <header className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">{job.companyName}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
            {title}
          </h1>
          {job.location ? (
            <p className="mt-2 text-zinc-600">{job.location}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={applyHref}
              className="inline-flex items-center rounded-full bg-[#211d19] px-5 py-2.5 text-sm font-semibold text-[#FBF9F4] transition hover:bg-zinc-800"
            >
              Apply now
            </Link>
            <span className="text-xs text-zinc-500">
              Apply, take the role assessment, see the public board. Assessment
              is not a hire score.
            </span>
          </div>
        </header>

        <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">About the role</h2>
          <div className="prose mt-4 max-w-none whitespace-pre-line text-zinc-700">
            {job.description}
          </div>
        </section>

        <footer className="mt-8 text-center text-sm text-zinc-500">
          {job.companyPublicSlug ? (
            <p>
              <Link
                href={`/careers/${encodeURIComponent(job.companyPublicSlug)}`}
                className="font-semibold underline underline-offset-2 hover:text-zinc-800"
              >
                More open roles at {job.companyName}
              </Link>
            </p>
          ) : null}
          <p className="mt-4 text-xs text-zinc-400">
            <Link href="/" className="hover:text-zinc-600">
              Powered by HireIQ
            </Link>
          </p>
        </footer>
      </article>
    </main>
  );
}

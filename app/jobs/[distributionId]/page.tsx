import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

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

  return {
    title: `${job.title} — ${job.companyName}`,
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

  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
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

  return (
    <main className="min-h-screen bg-slate-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="mx-auto max-w-3xl px-4 py-12">
        <header className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-indigo-600">{job.companyName}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            {job.title}
          </h1>
          {job.location ? (
            <p className="mt-2 text-slate-600">📍 {job.location}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href={job.applyUrl}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Apply now →
            </a>
            <span className="text-xs text-slate-500">
              Applications are handled securely via HireIQ.
            </span>
          </div>
        </header>

        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">About the role</h2>
          <div className="prose prose-slate mt-4 max-w-none whitespace-pre-line text-slate-700">
            {job.description}
          </div>
        </section>

        <footer className="mt-8 text-center text-xs text-slate-400">
          <Link href="/" className="hover:text-slate-600">
            Powered by HireIQ
          </Link>
        </footer>
      </article>
    </main>
  );
}

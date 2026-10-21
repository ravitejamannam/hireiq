import Link from "next/link";

import { hostedApplyPathFromSnapshot } from "@/lib/apply/hosted-apply-url";
import { displayJobTitle } from "@/lib/jobs/job-posting-view";
import {
  buildJobPostingJsonLd,
  serializeJsonLd,
} from "@/lib/jobs/public-feed/job-posting-jsonld";
import { publicCompanyJobsPath } from "@/lib/jobs/public-feed/public-job-slug";
import type { CanonicalJobPosting } from "@/lib/jobs/public-feed/canonical-job";

export function PublicJobArticle({
  job,
  postingUrl,
}: {
  job: CanonicalJobPosting;
  postingUrl: string | null;
}) {
  const title = displayJobTitle(job.title, job.companyName);
  const jsonLd = buildJobPostingJsonLd({
    title: job.title,
    companyName: job.companyName,
    description: job.description,
    datePosted: job.datePosted,
    validThrough: job.validThrough,
    location: job.location,
    remotePolicy: job.remotePolicy,
    compensationRange: job.compensationRange,
    employmentType: job.employmentType,
    postingUrl,
    applyUrl: job.applyUrl,
  });
  const applyHref = hostedApplyPathFromSnapshot(job.applyUrl) ?? job.applyUrl;

  return (
    <main className="min-h-screen bg-[#F7F4EE] text-zinc-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <article className="mx-auto max-w-3xl px-6 py-12">
        <header className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">{job.companyName}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">{title}</h1>
          {job.location ? <p className="mt-2 text-zinc-600">{job.location}</p> : null}
          {job.compensationRange ? (
            <p className="mt-2 text-zinc-600">{job.compensationRange}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={applyHref}
              className="inline-flex items-center rounded-full bg-[#211d19] px-5 py-2.5 text-sm font-semibold text-[#FBF9F4] transition hover:bg-zinc-800"
            >
              Apply now
            </Link>
            <span className="text-xs text-zinc-500">
              Apply on this site. Assessment score is not a hire decision.
            </span>
          </div>
        </header>
        <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">About the role</h2>
          <div className="mt-4 max-w-none whitespace-pre-line text-zinc-700">
            {job.description}
          </div>
        </section>
        <footer className="mt-8 text-center text-sm text-zinc-500">
          <p>
            <Link
              href={publicCompanyJobsPath(job.companyPublicSlug)}
              className="font-semibold underline underline-offset-2 hover:text-zinc-800"
            >
              More open roles at {job.companyName}
            </Link>
          </p>
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

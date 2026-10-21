import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feeds",
};

import Link from "next/link";

import CopyField from "@/components/integrations/CopyField";
import { updateCompanyPublicFeeds } from "@/app/actions/feed-settings-actions";
import { requireAdmin } from "@/lib/auth/authorization";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  getCompanyFeedDetail,
  listCompanyFeedSummaries,
  FeedManagementError,
} from "@/lib/jobs/public-feed/feed-admin";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ company?: string; feedError?: string; feedSaved?: string }>;
};

function parseCompanyId(value?: string): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 ? parsed : null;
}

export default async function FeedsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const { company, feedError, feedSaved } = await searchParams;

  const companies = await listCompanyFeedSummaries();
  const selectedId = parseCompanyId(company) ?? companies[0]?.companyId ?? null;

  let detail = null;
  let loadError: string | null = null;
  if (selectedId !== null) {
    try {
      detail = await getCompanyFeedDetail({ companyId: selectedId });
    } catch (error) {
      loadError =
        error instanceof FeedManagementError && error.code === "COMPANY_NOT_FOUND"
          ? "Company not found."
          : "Could not load feed details.";
    }
  }

  return (

    <DashboardLayout>
          <div className="space-y-8">
      <header>
        <Link
          href="/dashboard/integrations"
          className="text-sm text-indigo-600 hover:text-indigo-500"
        >
          ← Integrations
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Public job feeds</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Syndication links per company. The XML feed is for job boards and
          aggregators. Job pages include JobPosting structured data that search
          engines can read. That is not proof the URL is indexed.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2">
        {companies.map((c) => {
          const active = c.companyId === selectedId;
          return (
            <Link
              key={c.companyId}
              href={`/dashboard/integrations/feeds?company=${c.companyId}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {c.companyName}
              <span className="ml-2 text-xs opacity-60">{c.publicJobCount} live</span>
            </Link>
          );
        })}
      </nav>

      {loadError ? (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{loadError}</p>
      ) : detail ? (
        <div className="space-y-6">
          {detail.appUrlConfigured && detail.feedUrl ? (
            <section className="rounded-xl border border-zinc-200 bg-white p-6">
              <h2 className="font-semibold text-zinc-900">Tokenized XML job feed</h2>
              <p className="mb-3 mt-1 text-sm text-zinc-500">
                Existing signed feed. Treat it like a credential. It is separate
                from the company slug feeds below, which stay off until enabled.
              </p>
              <CopyField label="Feed URL" value={detail.feedUrl} />
            </section>
          ) : (
            <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
              APP_URL is not configured — feed and public URLs cannot be built.
              Set APP_URL in the environment to enable syndication.
            </p>
          )}

          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="font-semibold text-zinc-900">Company slug feeds</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Off by default. Enabling a feed does not mean LinkedIn or any
              other board has approved this company. The LinkedIn feed only
              turns on when a LinkedIn company ID and poster email are saved.
            </p>
            {feedSaved === "1" ? (
              <p className="mt-3 text-sm text-emerald-700">Feed settings saved.</p>
            ) : null}
            {feedError === "linkedin" ? (
              <p className="mt-3 text-sm text-red-700">
                LinkedIn feed was not enabled. Add the employer’s LinkedIn
                company ID and a poster email first.
              </p>
            ) : null}
            <form action={updateCompanyPublicFeeds} className="mt-4 space-y-3">
              <input type="hidden" name="companyId" value={detail.companyId} />
              <label className="flex items-center gap-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  name="jobsFeedEnabled"
                  defaultChecked={detail.jobsFeedEnabled}
                />
                Enable {detail.jobsFeedPath}
              </label>
              <label className="block text-sm text-zinc-700">
                LinkedIn company ID
                <input
                  name="linkedInCompanyId"
                  defaultValue={detail.linkedInCompanyId}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm text-zinc-700">
                LinkedIn poster email
                <input
                  name="linkedInPosterEmail"
                  type="email"
                  defaultValue={detail.linkedInPosterEmail}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                  autoComplete="off"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  name="linkedInFeedEnabled"
                  defaultChecked={detail.linkedInFeedEnabled}
                />
                Enable {detail.linkedInFeedPath}
              </label>
              <button
                type="submit"
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Save feed settings
              </button>
            </form>
          </section>

          <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-6 py-4">
              <h2 className="font-semibold text-zinc-900">
                Public job pages ({detail.jobs.length})
              </h2>
            </div>
            {detail.jobs.length === 0 ? (
              <p className="p-6 text-sm text-zinc-500">
                No published hosted-apply roles yet. Publish a distribution to
                make a role publicly visible.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {detail.jobs.map((job) => (
                  <li key={job.distributionId} className="px-6 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-zinc-900">{job.title}</p>
                        {job.location ? (
                          <p className="text-sm text-zinc-500">{job.location}</p>
                        ) : null}
                      </div>
                      <Link
                        href={`/jobs/${job.distributionId}`}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                      >
                        View public page →
                      </Link>
                    </div>
                    {job.publicJobUrl ? (
                      <div className="mt-3">
                        <CopyField label="Public job URL" value={job.publicJobUrl} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : companies.length === 0 ? (
        <p className="text-sm text-zinc-500">No companies exist yet.</p>
      ) : null}
    </div>
      </DashboardLayout>
  );
}

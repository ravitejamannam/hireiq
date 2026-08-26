import Link from "next/link";

import CopyField from "@/components/integrations/CopyField";
import { requireAdmin } from "@/lib/auth/authorization";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  getCompanyFeedDetail,
  listCompanyFeedSummaries,
  FeedManagementError,
} from "@/lib/jobs/public-feed/feed-admin";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ company?: string }>;
};

function parseCompanyId(value?: string): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 ? parsed : null;
}

export default async function FeedsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const { company } = await searchParams;

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
          aggregators; job pages are Google Jobs–indexed landing pages.
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
              <h2 className="font-semibold text-zinc-900">XML job feed</h2>
              <p className="mb-3 mt-1 text-sm text-zinc-500">
                Submit this URL to job boards and aggregators. Treat it like a
                credential — anyone holding it can read{" "}
                {detail.companyName}&apos;s published roles.
              </p>
              <CopyField label="Feed URL" value={detail.feedUrl} />
            </section>
          ) : (
            <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
              APP_URL is not configured — feed and public URLs cannot be built.
              Set APP_URL in the environment to enable syndication.
            </p>
          )}

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

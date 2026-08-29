import type { Metadata } from "next";
import Link from "next/link";

import { listPublicCareersDirectory } from "@/lib/careers/careers-service";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Open roles — HireIQ",
  description: "Companies hiring on HireIQ. Pick a company, open a role, apply on a hosted form.",
  robots: { index: true, follow: true },
};

export default async function PublicCareersIndexPage() {
  const companies = await listPublicCareersDirectory();

  return (
    <main className="min-h-screen bg-[#F7F4EE] text-zinc-900">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Careers
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">
          Open roles on HireIQ
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-zinc-600">
          Choose a company to see their live roles. Apply on a hosted form,
          take that role&apos;s assessment, then see the public board.
          Assessment score is not a hire decision.
        </p>

        {companies.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-600">
            No companies have open roles right now.
          </p>
        ) : (
          <ul className="mt-10 space-y-4">
            {companies.map((company) => (
              <li key={company.slug}>
                <Link
                  href={`/careers/${encodeURIComponent(company.slug)}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-400"
                >
                  <h2 className="text-lg font-bold text-zinc-900">
                    {company.companyName}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    {company.industry}
                    {" · "}
                    {company.openRoles} open role
                    {company.openRoles === 1 ? "" : "s"}
                  </p>
                  <p className="mt-4 text-sm font-semibold text-zinc-800">
                    View roles →
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

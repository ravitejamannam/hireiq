import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { hostedApplyPathFromSnapshot } from "@/lib/apply/hosted-apply-url";
import { getPublicCareersHub } from "@/lib/careers/careers-service";
import { displayJobTitle } from "@/lib/jobs/job-posting-view";
import { publicJobPath } from "@/lib/jobs/public-feed/public-job-slug";

export const revalidate = 60;

type PageProps = {
  params: Promise<{ company: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function postedLabel(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { company } = await params;
  const hub = await getPublicCareersHub(company);
  if (!hub) return { title: "Careers" };
  return {
    title: `Jobs — ${hub.companyName}`,
    description: `Open roles at ${hub.companyName}.`,
    robots: { index: true, follow: true },
  };
}

export default async function CompanyJobsPage({ params, searchParams }: PageProps) {
  const { company } = await params;
  const resolved = searchParams ? await searchParams : {};
  const hub = await getPublicCareersHub(company, {
    location: firstParam(resolved.location),
    employmentType: firstParam(resolved.employmentType),
    sort: firstParam(resolved.sort),
  });
  if (!hub) notFound();

  return (
    <main className="min-h-screen bg-[#F7F4EE] text-zinc-900">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Careers
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{hub.companyName}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {hub.industry}
          {hub.employees > 0 ? ` · ~${hub.employees} people` : ""}
        </p>
        {hub.aboutCompany ? (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-700">
            {hub.aboutCompany}
          </p>
        ) : null}
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-zinc-600">
          Only jobs this company has published for public apply are listed. Closed
          jobs are removed.
        </p>
        {hub.roles.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-600">
            No open roles are published right now.
          </p>
        ) : (
          <ul className="mt-10 space-y-4">
            {hub.roles.map((role) => (
              <li
                key={role.distributionId}
                className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-lg font-bold text-zinc-900">
                  {displayJobTitle(role.title, hub.companyName)}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {role.location ?? "Location not listed"}
                  {role.employmentTypeLabel ? ` · ${role.employmentTypeLabel}` : ""}
                  {" · "}
                  Posted {postedLabel(role.datePosted)}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href={hostedApplyPathFromSnapshot(role.applyUrl) ?? role.applyUrl}
                    className="inline-flex items-center rounded-full bg-[#211d19] px-4 py-2 text-sm font-semibold text-[#FBF9F4]"
                  >
                    Apply
                  </Link>
                  <Link
                    href={publicJobPath(hub.slug, role.title, role.distributionId)}
                    className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800"
                  >
                    View posting
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

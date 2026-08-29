import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { hostedApplyPathFromSnapshot } from "@/lib/apply/hosted-apply-url";
import { getPublicCareersHub } from "@/lib/careers/careers-service";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { displayJobTitle } from "@/lib/jobs/job-posting-view";

export const revalidate = 60;

type PageProps = {
  params: Promise<{ companySlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
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
  const { companySlug } = await params;
  const hub = await getPublicCareersHub(companySlug);
  if (!hub) {
    return { title: "Careers" };
  }

  return {
    title: `Careers — ${hub.companyName}`,
    description: `Open roles at ${hub.companyName}. Apply on a hosted form, take the role assessment, see where you stand.`,
    robots: { index: true, follow: true },
  };
}

export default async function PublicCareersPage({
  params,
  searchParams,
}: PageProps) {
  const { companySlug } = await params;
  const resolved = searchParams ? await searchParams : {};
  const query = {
    location: firstParam(resolved.location),
    employmentType: firstParam(resolved.employmentType),
    sort: firstParam(resolved.sort),
  };
  const hub = await getPublicCareersHub(companySlug, query);

  if (!hub) {
    notFound();
  }

  const origin = getPublicAppUrl();
  const jsonLd =
    origin && hub.roles.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `Careers at ${hub.companyName}`,
          itemListElement: hub.roles.map((role, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: displayJobTitle(role.title, hub.companyName),
            url: `${origin}/jobs/${role.distributionId}`,
          })),
        }
      : null;

  const locationValue = query.location ?? "";
  const employmentValue = query.employmentType ?? "";
  const sortValue = query.sort === "title" ? "title" : "newest";

  return (
    <main className="min-h-screen bg-[#F7F4EE] text-zinc-900">
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/careers"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900"
        >
          ← All companies
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Careers
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">
          {hub.companyName}
        </h1>
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
          Every open role below uses the same HireIQ path: hosted apply, a
          timed role assessment, then a public board for that role. Assessment
          score is not a hire decision.
        </p>

        <form method="get" className="mt-8 grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-zinc-600">
            Location
            <select
              name="location"
              defaultValue={locationValue}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
            >
              <option value="">All locations</option>
              {hub.locations.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-zinc-600">
            Employment type
            <select
              name="employmentType"
              defaultValue={employmentValue}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
            >
              <option value="">All types</option>
              {hub.employmentTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-zinc-600">
            Sort
            <select
              name="sort"
              defaultValue={sortValue}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
            >
              <option value="newest">Newest</option>
              <option value="title">Title</option>
            </select>
          </label>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="rounded-full bg-[#211d19] px-4 py-2 text-sm font-semibold text-[#FBF9F4]"
            >
              Filter roles
            </button>
          </div>
        </form>

        {hub.roles.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-600">
            No open roles match these filters.
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
                  {role.applicationCount != null
                    ? ` · ${role.applicationCount} application${role.applicationCount === 1 ? "" : "s"}`
                    : ""}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href={
                      hostedApplyPathFromSnapshot(role.applyUrl) ??
                      role.applyUrl
                    }
                    className="inline-flex items-center rounded-full bg-[#211d19] px-4 py-2 text-sm font-semibold text-[#FBF9F4] transition hover:bg-zinc-800"
                  >
                    Apply
                  </Link>
                  <Link
                    href={`/jobs/${role.distributionId}`}
                    className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100"
                  >
                    View posting
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-12 text-center text-xs text-zinc-400">
          <Link href="/" className="hover:text-zinc-600">
            Powered by HireIQ
          </Link>
        </p>
      </div>
    </main>
  );
}

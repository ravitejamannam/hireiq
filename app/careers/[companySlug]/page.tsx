import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { hostedApplyPathFromSnapshot } from "@/lib/apply/hosted-apply-url";
import { getPublicCareersHub } from "@/lib/careers/careers-service";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { displayJobTitle } from "@/lib/jobs/job-posting-view";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ companySlug: string }>;
};

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

export default async function PublicCareersPage({ params }: PageProps) {
  const { companySlug } = await params;
  const hub = await getPublicCareersHub(companySlug);

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

  return (
    <main className="min-h-screen bg-[#F7F4EE]">
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
          Careers
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">
          {hub.companyName}
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          {hub.industry}
          {hub.employees > 0 ? ` · ~${hub.employees} people` : ""}
        </p>
        {hub.aboutCompany ? (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-stone-700">
            {hub.aboutCompany}
          </p>
        ) : null}
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-stone-600">
          Every open role below uses the same HireIQ path: hosted apply, a
          timed role assessment, then a public board for that role. Assessment
          score is not a hire decision.
        </p>

        {hub.roles.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-stone-200 bg-white px-6 py-10 text-center text-sm text-stone-600">
            No open roles right now.
          </p>
        ) : (
          <ul className="mt-10 space-y-4">
            {hub.roles.map((role) => (
              <li
                key={role.distributionId}
                className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-lg font-bold text-stone-900">
                  {displayJobTitle(role.title, hub.companyName)}
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  {role.location ?? "Location not listed"}
                  {" · "}
                  Posted {postedLabel(role.datePosted)}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href={
                      hostedApplyPathFromSnapshot(role.applyUrl) ??
                      role.applyUrl
                    }
                    className="inline-flex items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-[#FBF9F4] transition hover:bg-stone-700"
                  >
                    Apply
                  </Link>
                  <Link
                    href={`/jobs/${role.distributionId}`}
                    className="inline-flex items-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                  >
                    View posting
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-12 text-center text-xs text-stone-400">
          <Link href="/" className="hover:text-stone-600">
            Powered by HireIQ
          </Link>
        </p>
      </div>
    </main>
  );
}

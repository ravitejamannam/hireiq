"use client";

import { useEffect, useState } from "react";

import { hostedApplyPathFromSnapshot } from "@/lib/apply/hosted-apply-url";
import { buildManualPostKit } from "@/lib/jobs/distribution/manual-post-kit";
import { prefixPublicOrigin, publicCompanyJobsPath, publicJobPath } from "@/lib/jobs/public-feed/public-job-slug";

function htmlAttr(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

type Channel = {
  label: string;
  description: string;
  value: string;
  kind: "url" | "snippet";
};

export default function DistributionKit({
  jobTitle,
  jobDescription,
  applyUrl,
  distributionId,
  companyId,
  companyPublicSlug,
  publicOrigin = "",
}: {
  jobTitle: string;
  jobDescription?: string | null;
  applyUrl: string | null;
  distributionId: number | null;
  companyId: number | null;
  companyPublicSlug?: string | null;
  /** Server-known public origin. Empty until the browser origin is applied after mount. */
  publicOrigin?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const configuredOrigin = publicOrigin.trim().replace(/\/$/, "");
  const [browserOrigin, setBrowserOrigin] = useState("");

  useEffect(() => {
    if (configuredOrigin) return;
    setBrowserOrigin(window.location.origin);
  }, [configuredOrigin]);

  const origin = configuredOrigin || browserOrigin;
  const snapshot = applyUrl?.trim() || "";
  const applyPath = snapshot ? hostedApplyPathFromSnapshot(snapshot) : null;
  const liveApply = applyPath ? prefixPublicOrigin(origin, applyPath) : snapshot;
  const careersUrl = companyPublicSlug
    ? prefixPublicOrigin(origin, publicCompanyJobsPath(companyPublicSlug))
    : "";

  const channels: Channel[] = [
    {
      label: "1. Hosted apply (candidates fill this)",
      description:
        "One link per published role. Share on LinkedIn, WhatsApp, email, or careers site. Submit sends them to the assessment.",
      value: liveApply,
      kind: "url",
    },
    {
      label: "2. Company careers hub",
      description:
        "Lists every open HireIQ-hosted role for this company. Share this when you have more than one live posting.",
      value: careersUrl,
      kind: "url",
    },
    {
      label: "3. Public job page",
      description:
        "Public job page with JobPosting structured data. Search engines can read it. That is not a guarantee the job appears in Google Jobs.",
      value:
        distributionId && companyPublicSlug
          ? prefixPublicOrigin(origin, publicJobPath(companyPublicSlug, jobTitle, distributionId))
          : "",
      kind: "url",
    },
    {
      label: "4. Embed on your careers site",
      description: "Iframe of the apply form. Zero extra JavaScript.",
      value: liveApply
        ? `<iframe src="${htmlAttr(prefixPublicOrigin(origin, `/embed/apply/${liveApply.split("/apply/").pop() ?? ""}`))}" style="width:100%;height:640px;border:0;border-radius:12px" title="${htmlAttr(`Apply — ${jobTitle}`)}" loading="lazy"></iframe>`
        : "",
      kind: "snippet",
    },
    {
      label: "5. XML feed (aggregators)",
      description:
        "Signed company feed. Open Integrations → Feeds to copy the tokenized URL. LinkedIn / Indeed / Naukri are partner-gated and do not post live yet.",
      value: companyId ? prefixPublicOrigin(origin, "/dashboard/integrations/feeds") : "",
      kind: "url",
    },
  ];

  function copy(channel: Channel) {
    if (!channel.value) return;
    void navigator.clipboard.writeText(channel.value);
    setCopied(channel.label);
    window.setTimeout(() => setCopied(null), 2000);
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Where this role is posted</h2>
      <p className="mt-1 text-sm text-zinc-500">
        {jobTitle}: candidates enter through hosted apply. After submit they
        take the role assessment. Results are visible only to the hiring team.
        Other jobs have their own links.
      </p>

      {!liveApply ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Publish a HireIQ-hosted distribution for this requirement to mint the
          apply link. LinkedIn / Indeed / Naukri stay unavailable until partner
          APIs are live.
        </p>
      ) : null}

      <ul className="mt-5 space-y-3">
        {channels.map((channel) => (
          <li
            key={channel.label}
            className="rounded-xl border border-zinc-200 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-black">{channel.label}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{channel.description}</p>
                {channel.value ? (
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300">
                    {channel.value}
                  </pre>
                ) : (
                  <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs italic text-zinc-400">
                    Not live until this role has a published HireIQ-hosted
                    distribution.
                  </p>
                )}
              </div>
              {channel.value ? (
                <button
                  type="button"
                  onClick={() => copy(channel)}
                  className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  {copied === channel.label ? "Copied" : "Copy"}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <ManualChannels
        jobTitle={jobTitle}
        description={jobDescription?.trim() || jobTitle}
        applyUrl={liveApply || null}
        distributionId={distributionId}
      />
    </section>
  );
}

function ManualChannels({
  jobTitle,
  description,
  applyUrl,
  distributionId,
}: {
  jobTitle: string;
  description: string;
  applyUrl: string | null;
  distributionId: number | null;
}) {
  const kit = buildManualPostKit({
    jobTitle,
    description,
    applyUrl,
    distributionId,
  });

  return (
    <div className="mt-8 border-t border-zinc-200 pt-6">
      <h3 className="text-base font-bold text-black">Manual post kit</h3>
      <p className="mt-1 text-sm text-zinc-500">
        Paste these into the employer’s own board account. A copied link is not
        a posted job. The external posting URL stays blank until you paste the
        live URL from that board. Recruiter confirmation is not provider
        verification. Inbound email is {kit.inboundEmailStatus}.
      </p>
      {kit.description ? (
        <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
          {kit.description}
        </pre>
      ) : null}
      <ul className="mt-4 space-y-3">
        {kit.channels.map((channel) => (
          <li key={channel.id} className="rounded-xl border border-zinc-200 p-4">
            <p className="text-sm font-semibold text-black">{channel.label}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-600">
              {channel.instructions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {channel.trackedApplyUrl ? (
              <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300">
                {channel.trackedApplyUrl}
              </pre>
            ) : (
              <p className="mt-2 text-xs text-zinc-400">
                Tracked apply URL appears after this role has a published hosted
                apply link.
              </p>
            )}
            <p className="mt-2 text-xs text-zinc-500">
              External posting URL: not recorded. Posting ID: none.
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

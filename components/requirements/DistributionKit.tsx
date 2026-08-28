"use client";

import { useState } from "react";

import { hostedApplyPathFromSnapshot } from "@/lib/apply/hosted-apply-url";

type Channel = {
  label: string;
  description: string;
  value: string;
  kind: "url" | "snippet";
};

export default function DistributionKit({
  jobTitle,
  applyUrl,
  distributionId,
  companyId,
  companyPublicSlug,
}: {
  jobTitle: string;
  applyUrl: string | null;
  distributionId: number | null;
  companyId: number | null;
  companyPublicSlug?: string | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const snapshot = applyUrl?.trim() || "";
  const applyPath = snapshot ? hostedApplyPathFromSnapshot(snapshot) : null;
  const liveApply = applyPath ? `${origin}${applyPath}` : snapshot;
  const leaderboardUrl = liveApply
    ? `${liveApply.replace(/\/$/, "")}/leaderboard`
    : "";
  const careersUrl = companyPublicSlug
    ? `${origin}/careers/${companyPublicSlug}`
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
      label: "2. Public assessment leaderboard",
      description:
        "Anonymized: first name and last initial. Ranked by this role's assessment only — not a hire score. Hiring teams see full names on the requirement desk.",
      value: leaderboardUrl,
      kind: "url",
    },
    {
      label: "3. Company careers hub",
      description:
        "Lists every open HireIQ-hosted role for this company. Share this when you have more than one live posting.",
      value: careersUrl,
      kind: "url",
    },
    {
      label: "4. Public job page",
      description:
        "Google Jobs structured-data listing. Apply CTA still uses the hosted apply link.",
      value: distributionId ? `${origin}/jobs/${distributionId}` : "",
      kind: "url",
    },
    {
      label: "5. Embed on your careers site",
      description: "Iframe of the apply form. Zero extra JavaScript.",
      value: liveApply
        ? `<iframe src="${origin}/embed/apply/${liveApply.split("/apply/").pop() ?? ""}" style="width:100%;height:640px;border:0;border-radius:12px" title="Apply — ${jobTitle}" loading="lazy"></iframe>`
        : "",
      kind: "snippet",
    },
    {
      label: "6. XML feed (aggregators)",
      description:
        "Signed company feed. Open Integrations → Feeds to copy the tokenized URL. LinkedIn / Indeed / Naukri are partner-gated and do not post live yet.",
      value: companyId ? `${origin}/dashboard/integrations/feeds` : "",
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
        take the role assessment. Scores land on this role&apos;s leaderboard.
        Other jobs have their own links and boards.
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
    </section>
  );
}

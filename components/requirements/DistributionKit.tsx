"use client";

import { useState } from "react";

/**
 * T127 Distribution Kit (Workable steal): every channel the role is
 * reachable through, with copy-to-clipboard. Shown on the requirement
 * workspace once a job specification version is PUBLISHED.
 */

type Channel = {
  label: string;
  description: string;
  value: string;
  kind: "url" | "snippet";
};

export default function DistributionKit({
  jobTitle,
  applyTokenHint,
  distributionId,
  companyId,
}: {
  jobTitle: string;
  /** First 8 chars of the stored hash — identification hint only. */
  applyTokenHint: string | null;
  distributionId: number | null;
  companyId: number | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [applyToken, setApplyToken] = useState("");

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const tokenReady = applyToken.trim().length > 16;

  const channels: Channel[] = [
    {
      label: "Hosted apply page",
      description: tokenReady
        ? "Share anywhere — LinkedIn, WhatsApp, email."
        : `Paste your apply token to unlock (starts ${applyTokenHint ?? "…"}…). HireIQ stores only a hash; keep your raw link safe.`,
      value: tokenReady ? `${origin}/apply/${applyToken.trim()}` : "",
      kind: "url",
    },
    {
      label: "Public job page",
      description:
        distributionId
          ? "Google Jobs structured-data page, indexed and shareable."
          : "Available once the role is distributed to your board.",
      value: distributionId ? `${origin}/jobs/${distributionId}` : "",
      kind: "url",
    },
    {
      label: "XML feed",
      description: "Point any job board aggregator at this feed URL.",
      value: `${origin}/feeds/jobs.xml`,
      kind: "url",
    },
    {
      label: "API endpoint",
      description: "Programmatic access via your API key.",
      value: `curl ${origin}/api/v1/jobs \\\n  -H "Authorization: Bearer hireiq_${companyId ?? "YOUR_ID"}_YOUR_KEY"`,
      kind: "snippet",
    },
    {
      label: "Embed widget",
      description: tokenReady
        ? "Paste into your careers site — iframe, zero JS needed."
        : "Paste your apply token above to generate the iframe snippet.",
      value: tokenReady
        ? `<iframe src="${origin}/embed/apply/${applyToken.trim()}" style="width:100%;height:640px;border:0;border-radius:12px" title="Apply — ${jobTitle}" loading="lazy"></iframe>`
        : "",
      kind: "snippet",
    },
  ];

  function copy(channel: Channel) {
    if (!channel.value) return;
    navigator.clipboard.writeText(channel.value);
    setCopied(channel.label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Distribution kit</h2>
      <p className="mt-1 text-sm text-zinc-500">
        {jobTitle} is live on HireIQ-controlled channels (hosted apply, job
        page, XML feed, embed). LinkedIn / Indeed / Naukri stay partner-gated.
      </p>

      {applyTokenHint ? (
        <label className="mt-4 block text-xs font-medium text-zinc-500">
          Apply token (from when you created the link — stays in your browser)
          <input
            value={applyToken}
            onChange={(e) => setApplyToken(e.target.value)}
            placeholder="Paste raw apply token to unlock share links"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
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
                    {channel.description}
                  </p>
                )}
              </div>
              {channel.value ? (
                <button
                  type="button"
                  onClick={() => copy(channel)}
                  className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  {copied === channel.label ? "✓ Copied" : "Copy"}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";

import { mintOfferAcceptanceAction } from "@/app/actions/offer-actions";

/**
 * T133: admin mints a single-use offer acceptance link (shown once).
 */
export default function MintOfferLinkButton({
  applicationId,
}: {
  applicationId: number;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [terms, setTerms] = useState("");
  const [compensation, setCompensation] = useState("");
  const [proposedStartDate, setProposedStartDate] = useState("");
  const [isPending, startTransition] = useTransition();

  function onMint() {
    setError(null);
    startTransition(async () => {
      const res = await mintOfferAcceptanceAction(applicationId, {
        terms,
        compensation,
        proposedStartDate,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLink(`${window.location.origin}${res.acceptUrlPath}`);
    });
  }

  return (
    <div className="mt-3 space-y-3">
      <label className="block text-xs font-medium text-zinc-600">
        Compensation
        <input
          type="text"
          value={compensation}
          onChange={(event) => setCompensation(event.target.value)}
          placeholder="As discussed"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </label>
      <label className="block text-xs font-medium text-zinc-600">
        Proposed start date
        <input
          type="date"
          value={proposedStartDate}
          onChange={(event) => setProposedStartDate(event.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </label>
      <label className="block text-xs font-medium text-zinc-600">
        Terms
        <textarea
          value={terms}
          onChange={(event) => setTerms(event.target.value)}
          rows={3}
          placeholder="Probation, notice, work location…"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </label>
      <button
        type="button"
        onClick={onMint}
        disabled={isPending}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
      >
        {isPending ? "Minting…" : "✍️ Mint offer acceptance link"}
      </button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {link ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold text-emerald-800">
            Share this link with the candidate — it&apos;s shown once.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-zinc-900 px-3 py-2 font-mono text-xs text-emerald-300">
              {link}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

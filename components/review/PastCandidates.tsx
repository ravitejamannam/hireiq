"use client";

import { useState } from "react";

type Hit = {
  candidateId: number;
  name: string;
  title: string | null;
  company: string | null;
  coverage: number;
  latestActivityAt: string;
  manualReview: boolean;
  stale: boolean;
  furthestStage: string;
  interviewScore: number | null;
  rejectionReason: string | null;
  quotes: string[];
  requirements: Array<{ key: string; result: string; quote: string | null }>;
};

export function PastCandidates(input: { jobId: number; hits: Hit[] }) {
  const [index, setIndex] = useState(0);
  const [help, setHelp] = useState(false);
  const current = input.hits[index] ?? null;

  function onKey(event: React.KeyboardEvent) {
    if (event.key === "j" || event.key === "ArrowDown") setIndex((value) => Math.min(input.hits.length - 1, value + 1));
    if (event.key === "k" || event.key === "ArrowUp") setIndex((value) => Math.max(0, value - 1));
    if (event.key === "?") setHelp((value) => !value);
    const submit = (id: string) => (document.getElementById(id) as HTMLFormElement | null)?.requestSubmit();
    if (event.key === "i") submit("rediscovery-invite");
    if (event.key === "n") submit("rediscovery-hide");
    if (event.key === "s") submit("rediscovery-shortlist");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]" tabIndex={0} onKeyDown={onKey}>
      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <h2 className="text-lg font-bold">Past candidates</h2>
          <div className="flex flex-wrap gap-2">
            <form method="post" action={`/dashboard/jobs/${input.jobId}/rediscovery`}>
              <input type="hidden" name="intent" value="ask-opt-in" />
              <button className="min-h-6 rounded border px-3 py-1 text-sm" type="submit">Ask past applicants to opt in</button>
            </form>
            <form method="post" action={`/dashboard/jobs/${input.jobId}/rediscovery`}>
              <input type="hidden" name="intent" value="search" />
              <button className="min-h-6 rounded bg-zinc-900 px-3 py-1 text-sm text-white" type="submit">Find past candidates</button>
            </form>
          </div>
        </div>
        {help ? <p className="bg-zinc-50 px-4 py-2 text-sm">J/K move, I invite, N hide, S shortlist, ? help.</p> : null}
        <ul>
          {input.hits.map((hit, rowIndex) => (
            <li key={hit.candidateId} className={`border-b border-zinc-100 px-4 py-3 ${rowIndex === index ? "bg-amber-50 outline outline-2 outline-amber-400" : ""}`}>
              <button type="button" className="w-full text-left" onClick={() => setIndex(rowIndex)}>
                <span className="font-semibold text-black">{hit.name}</span>
                <span className="ml-2 text-sm text-zinc-600">{hit.title}{hit.company ? ` · ${hit.company}` : ""}</span>
                <span className="ml-2 text-sm font-medium">{Math.round(hit.coverage * 100)}%</span>
                {hit.manualReview ? <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs">Manual review</span> : null}
                {hit.stale ? <span className="ml-2 rounded bg-zinc-100 px-2 py-0.5 text-xs">Resume older than 12 months</span> : null}
                <span className="mt-1 block text-sm text-zinc-600">{hit.quotes.slice(0, 3).join(" · ") || "No evidence quotes yet"}</span>
              </button>
            </li>
          ))}
          {input.hits.length === 0 ? <li className="px-4 py-6 text-sm">No past candidates yet. Publish the spec or search again.</li> : null}
        </ul>
      </section>
      <aside className="rounded-xl border border-zinc-200 bg-white p-4">
        {current ? (
          <div>
            <h2 className="text-lg font-bold">{current.name}</h2>
            <p className="text-sm text-zinc-600">Furthest stage {current.furthestStage}</p>
            <p className="mt-2 text-sm">Last activity {new Date(current.latestActivityAt).toLocaleDateString("en-IN")}</p>
            <p className="mt-2 text-sm">Submitted interview score {current.interviewScore == null ? "none" : `${current.interviewScore} / 5`}</p>
            {current.rejectionReason ? <p className="mt-2 text-sm">Previous rejection: {current.rejectionReason}</p> : null}
            <h3 className="mt-4 font-semibold">Requirements</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {current.requirements.map((item) => (
                <li key={item.key}>{item.result}: {item.key}{item.quote ? ` — “${item.quote}”` : ""}</li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-2">
              <form id="rediscovery-invite" method="post" action={`/dashboard/jobs/${input.jobId}/rediscovery`}>
                <input type="hidden" name="intent" value="invite" />
                <input type="hidden" name="candidateId" value={String(current.candidateId)} />
                <button className="min-h-6 w-full rounded border px-3 py-1 text-sm" type="submit">Invite to apply</button>
              </form>
              <form id="rediscovery-hide" method="post" action={`/dashboard/jobs/${input.jobId}/rediscovery`}>
                <input type="hidden" name="intent" value="hide" />
                <input type="hidden" name="candidateId" value={String(current.candidateId)} />
                <button className="min-h-6 w-full rounded border px-3 py-1 text-sm" type="submit">Not a fit</button>
              </form>
              <form id="rediscovery-shortlist" method="post" action={`/dashboard/jobs/${input.jobId}/rediscovery`}>
                <input type="hidden" name="intent" value="shortlist" />
                <input type="hidden" name="candidateId" value={String(current.candidateId)} />
                <button className="min-h-6 w-full rounded border px-3 py-1 text-sm" type="submit">Add to shortlist</button>
              </form>
            </div>
          </div>
        ) : <p className="text-sm">Select a past candidate.</p>}
      </aside>
    </div>
  );
}

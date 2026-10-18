"use client";

import { useEffect, useState } from "react";

import { copilotShortcutBlocked } from "@/lib/copilot/policy";
import type { StructuredFilters } from "@/lib/copilot/structured-filters";

type Citation = { label: string; quote: string; href: string };
type Action = { kind: string; label: string; applicationIds: number[]; draft: string | null; confirmed: boolean };
type PastLink = { label: string; href: string };

const PROMPTS = ["Top 5 for Kubernetes", "Who's stuck in interview > 7 days?", "Summarise feedback for Priya"];

export function CopilotPanel(input: { jobId: number | null; companyId: number }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [link, setLink] = useState<PastLink | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<StructuredFilters | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      if (event.key.toLowerCase() !== "c") return;
      const target = event.target as HTMLElement | null;
      const active = document.activeElement as HTMLElement | null;
      if (copilotShortcutBlocked(target) || copilotShortcutBlocked(active)) return;
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function ask(text: string) {
    setPending(true);
    setError(null);
    setAnswer("");
    setCitations([]);
    setLink(null);
    setAction(null);
    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, jobId: input.jobId, companyId: input.companyId }),
      });
      if (!response.ok || !response.body) {
        setError("The copilot could not answer.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      while (true) {
        const step = await reader.read();
        if (step.done) break;
        raw += decoder.decode(step.value, { stream: true });
        const split = raw.split("\n\n");
        setAnswer(split[0] ?? "");
      }
      const split = raw.split("\n\n");
      setAnswer(split[0] ?? "");
      if (split[1]) {
        const meta = JSON.parse(split[1]) as {
          citations?: Citation[];
          action?: Action | null;
          link?: PastLink | null;
          filters?: StructuredFilters;
        };
        setCitations(meta.citations ?? []);
        setLink(meta.link ?? null);
        setAction(meta.action ?? null);
        setFilters(meta.filters ?? null);
      }
    } catch {
      setError("The copilot could not answer.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className="fixed bottom-4 right-4 z-40 min-h-6 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white" onClick={() => setOpen(true)}>
        Copilot
      </button>
      {open ? (
        <aside className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-auto border-t border-zinc-300 bg-white p-4 shadow-lg sm:inset-y-0 sm:right-0 sm:left-auto sm:w-96 sm:border-l sm:border-t-0" aria-label="Recruiter copilot">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Copilot</h2>
            <button type="button" className="min-h-6 rounded border px-3 py-1 text-sm" onClick={() => setOpen(false)}>Close</button>
          </div>
          <p className="mt-1 text-sm text-zinc-700">Answers use this job's data. Press C to open. Citations open the source.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PROMPTS.map((prompt) => (
              <button key={prompt} type="button" className="min-h-6 rounded-full border px-3 py-1 text-xs" onClick={() => { setQuestion(prompt); void ask(prompt); }}>
                {prompt}
              </button>
            ))}
          </div>
          <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
            <label className="sr-only" htmlFor="copilot-question">Question</label>
            <input id="copilot-question" value={question} onChange={(event) => setQuestion(event.target.value)} className="min-h-6 min-w-0 flex-1 rounded border px-3 py-2 text-sm" />
            <button className="min-h-6 rounded bg-zinc-900 px-3 py-2 text-sm font-semibold text-white" type="submit" disabled={pending}>Ask</button>
          </form>
          {error ? <p role="alert" className="mt-3 text-sm">{error}</p> : null}
          {answer ? <p className="mt-4 text-sm whitespace-pre-wrap">{answer}</p> : null}
          {filters ? (
            <form
              className="mt-3 grid gap-2 rounded border border-zinc-300 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                const text = [
                  filters.skills.join(" "),
                  filters.minYears ? `${filters.minYears} years` : "",
                  filters.location ? `in ${filters.location}` : "",
                  filters.stage ?? "",
                ]
                  .filter(Boolean)
                  .join(" ");
                setQuestion(text);
                void ask(text);
              }}
            >
              <p className="text-xs font-semibold">Filters from the question. Edit them, then run the same search.</p>
              <label className="text-xs">
                Skills
                <input
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  value={filters.skills.join(", ")}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      skills: event.target.value.split(",").map((part) => part.trim()).filter(Boolean),
                    })
                  }
                />
              </label>
              <label className="text-xs">
                Minimum years
                <input
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  value={filters.minYears ?? ""}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      minYears: event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
              </label>
              <button className="min-h-6 rounded border px-3 py-1 text-xs font-semibold" type="submit">
                Run with these filters
              </button>
            </form>
          ) : null}
          {link ? <p className="mt-2 text-sm"><a className="font-semibold underline" href={link.href}>{link.label}</a></p> : null}
          {citations.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {citations.map((citation) => (
                <li key={`${citation.href}-${citation.quote}`}>
                  <a className="inline-flex min-h-6 items-center rounded-full border border-zinc-400 px-3 py-1 text-xs font-semibold" href={citation.href}>
                    {citation.label}: “{citation.quote}”
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {action ? (
            <form className="mt-4 rounded border border-zinc-300 p-3" method="post" action="/api/copilot/confirm">
              <p className="text-sm font-semibold">{action.label}</p>
              <p className="mt-1 text-sm">This will not run until you confirm. The copilot cannot reject a candidate.</p>
              <input type="hidden" name="kind" value={action.kind} />
              <input type="hidden" name="applicationIds" value={action.applicationIds.join(",")} />
              <button className="mt-2 min-h-6 rounded bg-zinc-900 px-3 py-2 text-sm font-semibold text-white" type="submit">Confirm</button>
            </form>
          ) : null}
        </aside>
      ) : null}
    </>
  );
}

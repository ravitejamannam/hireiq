"use client";

import { useMemo, useState, useTransition } from "react";

import { saveInterviewRubricScores } from "@/app/actions/blueprint-actions";

type Competency = {
  name: string;
  weight: number;
  description: string | null;
};

type ExistingScore = {
  competencyName: string;
  score: number;
  notes: string | null;
};

const SCORE_LABELS: Record<number, string> = {
  1: "1 · Poor",
  2: "2 · Below bar",
  3: "3 · Meets bar",
  4: "4 · Strong",
  5: "5 · Exceptional",
};

export default function RubricPanel({
  applicationId,
  evaluationId,
  competencies,
  existingScores,
}: {
  applicationId: number;
  evaluationId: number | null;
  competencies: Competency[];
  existingScores: ExistingScore[];
}) {
  const initial = useMemo(() => {
    const map = new Map(existingScores.map((s) => [s.competencyName.toLowerCase(), s]));
    return Object.fromEntries(
      competencies.map((c) => {
        const found = map.get(c.name.toLowerCase());
        return [c.name, { score: found?.score ?? 0, notes: found?.notes ?? "" }];
      }),
    ) as Record<string, { score: number; notes: string }>;
  }, [competencies, existingScores]);

  const [values, setValues] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const scoredCount = competencies.filter((c) => values[c.name]?.score >= 1).length;
  const complete = scoredCount === competencies.length;

  function setScore(name: string, score: number) {
    setValues((prev) => ({ ...prev, [name]: { ...prev[name], score } }));
  }

  function setNotes(name: string, notes: string) {
    setValues((prev) => ({ ...prev, [name]: { ...prev[name], notes } }));
  }

  function onSave() {
    if (!evaluationId) {
      setMessage({ ok: false, text: "Save the interview/evaluation first, then add rubric scores." });
      return;
    }
    setMessage(null);
    const scores = competencies.map((c) => ({
      competencyName: c.name,
      score: values[c.name]?.score ?? 0,
      notes: values[c.name]?.notes ?? "",
    }));
    startTransition(async () => {
      const result = await saveInterviewRubricScores(applicationId, evaluationId, scores);
      if (result.ok) {
        setMessage({ ok: true, text: `Rubric saved — all ${result.saved} competencies scored.` });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-zinc-900">Interview rubric</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Score every competency (required before the rubric counts as
            complete). Scores snapshot against this role&apos;s rubric version.
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
            complete
              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
              : "bg-amber-50 text-amber-700 ring-amber-600/20"
          }`}
        >
          {scoredCount}/{competencies.length} scored
        </span>
      </div>

      <ul className="mt-4 space-y-4">
        {competencies.map((c) => (
          <li key={c.name} className="rounded-lg border border-zinc-100 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">{c.name}</p>
                {c.description ? (
                  <p className="mt-0.5 text-xs text-zinc-500">{c.description}</p>
                ) : null}
              </div>
              <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                weight {c.weight}%
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={`Score for ${c.name}`}>
              {[1, 2, 3, 4, 5].map((n) => {
                const selected = values[c.name]?.score === n;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setScore(c.name, n)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      selected
                        ? "bg-indigo-600 text-white"
                        : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {SCORE_LABELS[n]}
                  </button>
                );
              })}
            </div>

            <textarea
              value={values[c.name]?.notes ?? ""}
              onChange={(e) => setNotes(c.name, e.target.value)}
              placeholder="Evidence notes — what did the candidate say or do? (optional)"
              rows={2}
              className="mt-3 w-full resize-y rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={isPending || !complete}
          title={!complete ? "Score every competency first" : undefined}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save rubric scores"}
        </button>
        {message ? (
          <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`} role="status">
            {message.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}

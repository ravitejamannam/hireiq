"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { requestPracticalSuggestions, savePracticalScores } from "@/app/actions/screening-actions";

type Criterion = {
  key: string;
  label: string;
  description: string;
  maxPoints: number;
  human: { points: number; rationale: string | null; by: string | null } | null;
  suggestion: { points: number; rationale: string | null; quote: string | null } | null;
};

export default function PracticalGrader(props: {
  codingTestId: number;
  humanOnly: boolean;
  graded: boolean;
  score: { points: number; max: number } | null;
  criteria: Criterion[];
}) {
  const router = useRouter();
  const [points, setPoints] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.criteria.map((criterion) => [criterion.key, criterion.human ? String(criterion.human.points) : ""])),
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    const scores = props.criteria
      .filter((criterion) => points[criterion.key] !== "" && points[criterion.key] !== undefined)
      .map((criterion) => ({ criterionKey: criterion.key, points: Number(points[criterion.key]), rationale: notes[criterion.key] ?? null }));
    if (scores.length === 0) {
      setError("Enter at least one score.");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await savePracticalScores({ codingTestId: props.codingTestId, scores });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(result.changed === 0 ? "No scores changed." : result.complete ? "Saved. All criteria are scored, so the practical result is final." : "Saved. Score the remaining criteria to finish grading.");
    setNotes({});
    router.refresh();
  }

  async function suggest() {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await requestPracticalSuggestions(props.codingTestId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(
      `${result.suggested} suggestion(s) added${result.dropped > 0 ? `; ${result.dropped} dropped because they did not quote the submission` : ""}. Suggestions do not count until you enter your own score.`,
    );
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          {props.score ? (
            <span className="font-semibold">Final: {props.score.points} / {props.score.max} ({((props.score.points / props.score.max) * 100).toFixed(1)}%)</span>
          ) : (
            <span className="text-zinc-600">Not final until every criterion has a reviewer score.</span>
          )}
        </p>
        {props.humanOnly ? (
          <span className="text-xs text-zinc-500">AI suggestions are off for this candidate.</span>
        ) : (
          <button type="button" className="rounded border px-3 py-1 text-sm" disabled={pending} onClick={() => void suggest()}>Get AI suggestions</button>
        )}
      </div>
      {error ? <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notice}</p> : null}
      <ul className="space-y-3">
        {props.criteria.map((criterion) => {
          const changing = criterion.human !== null && points[criterion.key] !== String(criterion.human.points);
          return (
            <li key={criterion.key} className="rounded-lg border border-zinc-200 p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{criterion.label} <span className="text-xs text-zinc-500">({criterion.maxPoints} pts)</span></p>
                  {criterion.description ? <p className="text-xs text-zinc-600">{criterion.description}</p> : null}
                </div>
                <label className="flex items-center gap-2 text-xs">
                  Score
                  <input
                    type="number"
                    min={0}
                    max={criterion.maxPoints}
                    step={1}
                    value={points[criterion.key] ?? ""}
                    onChange={(event) => setPoints((current) => ({ ...current, [criterion.key]: event.target.value }))}
                    className="w-20 rounded border px-2 py-1 text-sm"
                    aria-label={`${criterion.label} score`}
                  />
                </label>
              </div>
              {criterion.human ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Current: {criterion.human.points}{criterion.human.by ? ` by ${criterion.human.by}` : ""}{criterion.human.rationale ? ` — ${criterion.human.rationale}` : ""}
                </p>
              ) : null}
              {criterion.suggestion ? (
                <p className="mt-1 rounded bg-sky-50 px-2 py-1 text-xs text-sky-900">
                  AI suggestion (not counted): {criterion.suggestion.points}/{criterion.maxPoints}
                  {criterion.suggestion.rationale ? ` — ${criterion.suggestion.rationale}` : ""}
                  {criterion.suggestion.quote ? <span className="block">Quote: “{criterion.suggestion.quote}”</span> : null}
                </p>
              ) : null}
              <input
                value={notes[criterion.key] ?? ""}
                onChange={(event) => setNotes((current) => ({ ...current, [criterion.key]: event.target.value }))}
                maxLength={1000}
                placeholder={changing ? "Reason for changing the score (required)" : "Note (optional)"}
                className="mt-2 w-full rounded border px-2 py-1 text-xs"
                aria-label={`${criterion.label} note`}
              />
            </li>
          );
        })}
      </ul>
      <button type="button" className="rounded bg-zinc-900 px-4 py-2 text-sm font-semibold text-white" disabled={pending} onClick={() => void save()}>
        Save scores
      </button>
    </div>
  );
}

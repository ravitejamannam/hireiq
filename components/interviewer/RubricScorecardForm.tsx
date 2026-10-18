"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { submitRubricScorecard } from "@/app/actions/evaluation-actions";

type RubricItem = { criterion: string; signal: string };

export default function RubricScorecardForm({
  applicationId,
  rubric,
  submitted,
}: {
  applicationId: number;
  rubric: RubricItem[];
  submitted: boolean;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const items = rubric.length > 0 ? rubric : [{ criterion: "Overall", signal: "No job rubric yet. Score the interview 1 to 5 and leave notes. Ask the recruiter to generate a rubric so later interviews use the same criteria." }];
  if (submitted) {
    return <p className="text-sm text-zinc-600">Scorecard submitted. Other interviewers&apos; scores are now visible to you.</p>;
  }

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        void submitRubricScorecard({
          applicationId,
          scores: items.map((item) => ({
            criterion: item.criterion,
            score: Number(scores[item.criterion] ?? ""),
          })),
          notes,
        })
          .then(() => router.refresh())
          .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not submit."))
          .finally(() => setPending(false));
      }}
    >
      <h3 className="font-semibold text-black">Scorecard</h3>
      <p className="text-sm text-zinc-600">Scores stay hidden from other interviewers until you submit.</p>
      {items.map((item) => (
        <label key={item.criterion} className="block text-sm">
          <span className="font-medium">{item.criterion}</span>
          {item.signal ? <span className="mt-1 block text-zinc-500">{item.signal}</span> : null}
          <input
            required
            min={1}
            max={5}
            type="number"
            aria-label={`Score for ${item.criterion}`}
            className="mt-1 w-24 rounded border px-2 py-1"
            value={scores[item.criterion] ?? ""}
            onChange={(event) => setScores((current) => ({ ...current, [item.criterion]: event.target.value }))}
          />
        </label>
      ))}
      <label className="block text-sm">
        Notes
        <textarea
          aria-label="Scorecard notes"
          className="mt-1 w-full rounded border px-2 py-1"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
        Submit scorecard
      </button>
    </form>
  );
}

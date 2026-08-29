"use client";

import { InterviewType } from "@prisma/client";
import { useState, useTransition } from "react";

import { setInterviewRoundPlan } from "@/app/actions/job-actions";
import {
  INTERVIEW_TYPE_LABELS,
  normalizeInterviewRoundPlan,
} from "@/lib/hiring/interview-rounds";
import type { InterviewRoundProgress } from "@/lib/hiring/interview-rounds";

const ALL_TYPES = Object.values(InterviewType);

export default function InterviewRoundPlanForm({
  jobId,
  storedPlan,
  progress,
}: {
  jobId: number;
  storedPlan: InterviewType[];
  progress: InterviewRoundProgress[];
}) {
  const initial = normalizeInterviewRoundPlan(storedPlan);
  const [selected, setSelected] = useState<InterviewType[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(type: InterviewType) {
    setSelected((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type],
    );
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      try {
        const saved = await setInterviewRoundPlan(jobId, selected);
        setSelected(saved);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save rounds.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h3 className="text-sm font-bold text-zinc-900">Interview round sequence</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Ordered types for this requirement. Empty selection saves as the default
        (phone screen, then technical). Rubric scores stay on evaluations — this
        is sequencing, not a rating.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {ALL_TYPES.map((type) => {
          const on = selected.includes(type);
          const order = selected.indexOf(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggle(type)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                on
                  ? "border-stone-800 bg-stone-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700"
              }`}
            >
              {on ? `${order + 1}. ` : ""}
              {INTERVIEW_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={isPending}
          className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save sequence"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
      {progress.length > 0 ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {progress.map((round) => (
            <li
              key={round.type}
              className="rounded-lg border border-zinc-100 px-3 py-2 text-sm text-zinc-600"
            >
              <span className="font-medium text-zinc-900">{round.label}</span>
              <span className="mt-0.5 block text-xs">
                {round.booked} booked · {round.completed} completed
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

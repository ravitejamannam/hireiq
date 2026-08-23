"use client";

import { useState, useTransition } from "react";

import {
  retireAssessmentQuestion,
  reactivateAssessmentQuestion,
} from "@/app/actions/bank-health-actions";

type QuestionView = {
  id: number;
  roleCategory: string;
  promptPreview: string;
  active: boolean;
  timesUsed: number;
  exposure: "LOW" | "MEDIUM" | "HIGH";
};

type Health = {
  totals: { active: number; retired: number };
  byCategory: Array<{
    roleCategory: string;
    active: number;
    retired: number;
    maxTimesUsed: number;
  }>;
  questions: QuestionView[];
};

const EXPOSURE_STYLES: Record<string, string> = {
  HIGH: "bg-red-50 text-red-700 ring-red-600/20",
  MEDIUM: "bg-amber-50 text-amber-700 ring-amber-600/20",
  LOW: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

export default function BankHealthClient({ health }: { health: Health }) {
  const [filter, setFilter] = useState<string>("ALL");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const visible =
    filter === "ALL" ? health.questions : health.questions.filter((q) => q.roleCategory === filter);

  function toggle(questionId: number, active: boolean) {
    setPendingId(questionId);
    setError(null);
    startTransition(async () => {
      const result = active
        ? await retireAssessmentQuestion(questionId)
        : await reactivateAssessmentQuestion(questionId);
      if (!result.ok) setError(result.error);
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-500">Active questions</p>
          <h2 className="mt-2 text-3xl font-bold text-black">{health.totals.active}</h2>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-500">Retired</p>
          <h2 className="mt-2 text-3xl font-bold text-black">{health.totals.retired}</h2>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-500">High exposure (≥5 uses)</p>
          <h2 className="mt-2 text-3xl font-bold text-black">
            {health.questions.filter((q) => q.exposure === "HIGH").length}
          </h2>
        </article>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("ALL")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === "ALL" ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50"}`}
        >
          All
        </button>
        {health.byCategory.map((c) => (
          <button
            key={c.roleCategory}
            type="button"
            onClick={() => setFilter(c.roleCategory)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === c.roleCategory ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50"}`}
          >
            {c.roleCategory} · max used {c.maxTimesUsed}×
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50">
            <tr>
              {["Exposure", "Used", "Category", "Prompt", "State", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-zinc-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visible.map((q) => (
              <tr key={q.id} className={q.active ? "" : "opacity-50"}>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${EXPOSURE_STYLES[q.exposure]}`}
                  >
                    {q.exposure}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-zinc-800">{q.timesUsed}×</td>
                <td className="px-4 py-3 text-zinc-600">{q.roleCategory}</td>
                <td className="max-w-md truncate px-4 py-3 text-zinc-700">{q.promptPreview}</td>
                <td className="px-4 py-3">
                  {q.active ? (
                    <span className="text-xs font-medium text-emerald-600">Active</span>
                  ) : (
                    <span className="text-xs font-medium text-zinc-500">Retired</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={pendingId === q.id}
                    onClick={() => toggle(q.id, q.active)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      q.active
                        ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    } disabled:opacity-50`}
                  >
                    {pendingId === q.id
                      ? "…"
                      : q.active
                        ? "Retire"
                        : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error ? <p className="px-4 pb-3 text-sm text-red-600">{error}</p> : null}
      </section>
    </div>
  );
}

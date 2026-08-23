"use client";

import { useState, useTransition } from "react";

import { saveBlueprint } from "@/app/actions/blueprint-actions";

type Competency = {
  name: string;
  description: string;
  weight: number;
};

type Question = {
  competencyName: string;
  question: string;
  guidance: string;
  difficulty: string | null;
};

export default function BlueprintEditor({
  specVersionId,
  initialCompetencies,
  initialQuestions,
}: {
  specVersionId: number;
  initialCompetencies: Competency[];
  initialQuestions: Question[];
}) {
  const [competencies, setCompetencies] = useState<Competency[]>(
    initialCompetencies.length > 0
      ? initialCompetencies
      : [{ name: "", description: "", weight: 100 }],
  );
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const totalWeight = competencies.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);

  function updateCompetency(index: number, patch: Partial<Competency>) {
    setCompetencies((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function onSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveBlueprint({
        specVersionId,
        competencies: competencies.map((c) => ({
          name: c.name,
          description: c.description || undefined,
          weight: Number(c.weight),
        })),
        questions: questions
          .filter((q) => q.question.trim())
          .map((q) => ({
            competencyName: q.competencyName,
            question: q.question,
            guidance: q.guidance || undefined,
            difficulty: q.difficulty || undefined,
          })),
      });
      if (result.ok) {
        setMessage({ ok: true, text: `Blueprint saved (v${result.blueprint.version}).` });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-zinc-900">Competencies</h2>
            <p className="text-sm text-zinc-500">Weights must sum to exactly 100.</p>
          </div>
          <span
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
              totalWeight === 100 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            total {totalWeight}/100
          </span>
        </div>

        <ul className="mt-4 space-y-3">
          {competencies.map((c, index) => (
            <li key={index} className="grid grid-cols-12 gap-3 rounded-lg border border-zinc-100 p-3">
              <input
                value={c.name}
                onChange={(e) => updateCompetency(index, { name: e.target.value })}
                placeholder="Competency (e.g. System Design)"
                className="col-span-5 rounded-md border border-zinc-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <input
                value={c.description}
                onChange={(e) => updateCompetency(index, { description: e.target.value })}
                placeholder="What does good look like?"
                className="col-span-4 rounded-md border border-zinc-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <input
                type="number"
                min={1}
                max={100}
                value={c.weight}
                onChange={(e) => updateCompetency(index, { weight: Number(e.target.value) })}
                className="col-span-1 rounded-md border border-zinc-200 px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                aria-label="Weight"
              />
              <button
                type="button"
                onClick={() => setCompetencies((prev) => prev.filter((_, i) => i !== index))}
                disabled={competencies.length <= 1}
                className="col-span-2 rounded-md text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            setCompetencies((prev) => [...prev, { name: "", description: "", weight: 0 }])
          }
          className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          + Add competency
        </button>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900">Question bank</h2>
        <p className="text-sm text-zinc-500">
          Optional. Tag each question to a competency so interviews stay on-rubric.
        </p>

        <ul className="mt-4 space-y-3">
          {questions.map((q, index) => (
            <li key={index} className="rounded-lg border border-zinc-100 p-3">
              <textarea
                value={q.question}
                onChange={(e) =>
                  setQuestions((prev) =>
                    prev.map((item, i) => (i === index ? { ...item, question: e.target.value } : item)),
                  )
                }
                placeholder="Question"
                rows={2}
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <div className="mt-2 grid grid-cols-12 gap-2">
                <select
                  value={q.competencyName}
                  onChange={(e) =>
                    setQuestions((prev) =>
                      prev.map((item, i) => (i === index ? { ...item, competencyName: e.target.value } : item)),
                    )
                  }
                  className="col-span-4 rounded-md border border-zinc-200 px-2 py-2 text-sm"
                >
                  <option value="">Tag competency…</option>
                  {competencies.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={q.difficulty ?? ""}
                  onChange={(e) =>
                    setQuestions((prev) =>
                      prev.map((item, i) => (i === index ? { ...item, difficulty: e.target.value } : item)),
                    )
                  }
                  className="col-span-3 rounded-md border border-zinc-200 px-2 py-2 text-sm"
                >
                  <option value="">Difficulty…</option>
                  <option>EASY</option>
                  <option>MEDIUM</option>
                  <option>HARD</option>
                </select>
                <input
                  value={q.guidance}
                  onChange={(e) =>
                    setQuestions((prev) =>
                      prev.map((item, i) => (i === index ? { ...item, guidance: e.target.value } : item)),
                    )
                  }
                  placeholder="What good looks like"
                  className="col-span-4 rounded-md border border-zinc-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== index))}
                  className="col-span-1 rounded-md text-sm text-red-600 hover:bg-red-50"
                  aria-label="Remove question"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            setQuestions((prev) => [
              ...prev,
              { competencyName: competencies[0]?.name ?? "", question: "", guidance: "", difficulty: "MEDIUM" },
            ])
          }
          disabled={competencies.every((c) => !c.name.trim())}
          className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-40"
        >
          + Add question
        </button>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={isPending}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save blueprint"}
        </button>
        {message ? (
          <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`} role="status">
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QuestionDifficulty, RoleCategory } from "@prisma/client";

import {
  createBankQuestionAction,
  setBankQuestionActiveAction,
} from "@/app/actions/bank-admin-actions";

type Question = {
  id: number;
  roleCategory: RoleCategory;
  sortOrder: number;
  prompt: string;
  choices: string[];
  correctIndex: number;
  weight: number;
  skillTag: string | null;
  difficulty: QuestionDifficulty;
  active: boolean;
  timesUsed: number;
};

const ROLE_CATEGORIES: RoleCategory[] = ["ENGINEERING", "SALES", "DESIGN", "FINANCE"];
const DIFFICULTIES: QuestionDifficulty[] = ["EASY", "MEDIUM", "HARD"];

export default function BankAdminClient({ initialQuestions }: { initialQuestions: Question[] }) {
  const router = useRouter();
  const [questions] = useState(initialQuestions);
  const [filterRole, setFilterRole] = useState<RoleCategory | "ALL">("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Create form state
  const [roleCategory, setRoleCategory] = useState<RoleCategory>("ENGINEERING");
  const [prompt, setPrompt] = useState("");
  const [choices, setChoices] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>("MEDIUM");
  const [weight, setWeight] = useState("1");
  const [skillTag, setSkillTag] = useState("");

  const filtered = useMemo(
    () => questions.filter((q) => filterRole === "ALL" || q.roleCategory === filterRole),
    [questions, filterRole],
  );

  const activeCount = filtered.filter((q) => q.active).length;

  function onCreate() {
    setNotice(null);
    startTransition(async () => {
      const res = await createBankQuestionAction({
        roleCategory,
        prompt,
        choices,
        correctIndex,
        weight: Number(weight) || 1,
        skillTag: skillTag || undefined,
        difficulty,
      });
      if (!res.ok) {
        setNotice(res.error);
        return;
      }
      setNotice("✓ Question added to the bank.");
      setPrompt("");
      setChoices(["", "", "", ""]);
      setCorrectIndex(0);
      router.refresh();
    });
  }

  function onToggle(id: number, active: boolean) {
    startTransition(async () => {
      await setBankQuestionActiveAction(id, active);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterRole("ALL")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${filterRole === "ALL" ? "bg-black text-white" : "bg-zinc-100 text-black hover:bg-zinc-200"}`}
          >
            All
          </button>
          {ROLE_CATEGORIES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setFilterRole(r)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition capitalize ${filterRole === r ? "bg-black text-white" : "bg-zinc-100 text-black hover:bg-zinc-200"}`}
            >
              {r.toLowerCase()}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-500">
          {activeCount} active / {filtered.length} total
        </span>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          {showCreate ? "Close" : "+ New question"}
        </button>
      </div>

      {notice ? (
        <p className="text-sm text-emerald-700" role="status">{notice}</p>
      ) : null}

      {showCreate && (
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-zinc-500">
              Role category
              <select
                value={roleCategory}
                onChange={(e) => setRoleCategory(e.target.value as RoleCategory)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm capitalize"
              >
                {ROLE_CATEGORIES.map((r) => (
                  <option key={r} value={r}>{r.toLowerCase()}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-zinc-500">
              Difficulty
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as QuestionDifficulty)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm lowercase"
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>{d.toLowerCase()}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-zinc-500">
              Weight (1–10)
              <input
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-zinc-500">
            Prompt
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder="What does REST stand for?"
              className="mt-1 w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-zinc-500">
              Choices — select the radio next to the correct answer
            </legend>
            {choices.map((choice, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct-choice"
                  checked={correctIndex === i}
                  onChange={() => setCorrectIndex(i)}
                  className="h-4 w-4 text-indigo-600"
                  aria-label={`Choice ${i + 1} is correct`}
                />
                <input
                  value={choice}
                  onChange={(e) =>
                    setChoices((prev) => prev.map((c, j) => (j === i ? e.target.value : c)))
                  }
                  placeholder={`Choice ${i + 1}${i >= 3 ? " (optional)" : ""}`}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
            ))}
          </fieldset>

          <div className="flex items-end gap-3">
            <label className="flex-1 text-xs font-medium text-zinc-500">
              Skill tag (optional)
              <input
                value={skillTag}
                onChange={(e) => setSkillTag(e.target.value)}
                placeholder="react"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={onCreate}
              disabled={isPending || prompt.trim().length < 8}
              className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
            >
              {isPending ? "Adding…" : "Add question"}
            </button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
        {filtered.map((q) => (
          <li key={q.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${q.active ? "text-zinc-900" : "text-zinc-400 line-through"}`}>
                {q.prompt}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                ✓ {q.choices[q.correctIndex]} · used {q.timesUsed}× · weight {q.weight}
                {q.skillTag ? ` · #${q.skillTag}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-medium lowercase ${
                  q.difficulty === "EASY"
                    ? "bg-emerald-50 text-emerald-700"
                    : q.difficulty === "HARD"
                      ? "bg-red-50 text-red-600"
                      : "bg-amber-50 text-amber-700"
                }`}
              >
                {q.difficulty.toLowerCase()}
              </span>
              <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                {q.roleCategory.toLowerCase()}
              </span>
              <button
                type="button"
                onClick={() => onToggle(q.id, !q.active)}
                disabled={isPending}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                  q.active
                    ? "border-red-200 text-red-600 hover:bg-red-50"
                    : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                {q.active ? "Retire" : "Reactivate"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { correctAssessmentItemGrade, rerunAssessmentGrading } from "@/app/actions/generated-assessment-actions";

type Item = {
  id: string;
  type: string;
  prompt: string;
  requirement: string;
  max: number;
  answer: string | null;
  correctChoice: string | null;
  grade: { score: number | null; needsHuman: boolean; quote: string | null; reason: string | null; overrideReason: string | null } | null;
};

const REASON_LABEL: Record<string, string> = {
  "ai-unavailable": "AI grading unavailable",
  "model-error": "AI grading failed",
  "human-only": "Human grading requested",
  "runner-unavailable": "Code runner unavailable",
  "automated-tests": "Automated tests",
  "no-answer": "No answer given",
};

function source(item: Item) {
  if (!item.grade) return "Not graded";
  if (item.grade.overrideReason) return "Corrected by a reviewer";
  if (item.type === "multiple_choice") return "Answer key";
  if (item.grade.reason && REASON_LABEL[item.grade.reason]) return REASON_LABEL[item.grade.reason];
  return "AI-suggested (quote-backed)";
}

export default function AssessmentGradeEditor({ inviteId, gradingFinished, items }: { inviteId: number; gradingFinished: boolean; items: Item[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [score, setScore] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(item: Item) {
    setPending(true);
    setError(null);
    const result = await correctAssessmentItemGrade({ inviteId, itemId: item.id, score: Number(score), reason });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function regrade() {
    setPending(true);
    setError(null);
    const result = await rerunAssessmentGrading(inviteId);
    setPending(false);
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="space-y-3">
      {!gradingFinished ? (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Grading did not finish for this submission. No score is shown until it does.{" "}
          <button type="button" className="underline" disabled={pending} onClick={() => void regrade()}>Re-run grading</button>
        </p>
      ) : null}
      {error ? <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <ol className="space-y-3">
        {items.map((item, index) => (
          <li key={item.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-medium">{index + 1}. {item.prompt}</p>
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${item.grade?.needsHuman ? "bg-amber-100 text-amber-900" : "bg-zinc-100 text-zinc-700"}`}>
                {item.grade?.needsHuman ? "Needs grading" : item.grade?.score !== null && item.grade ? `${item.grade.score} / ${item.max}` : "—"}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">Measures: {item.requirement} · {source(item)}</p>
            <div className="mt-2 rounded bg-zinc-50 p-2">
              <p className="text-xs font-semibold text-zinc-500">Candidate answer</p>
              <pre className="mt-1 whitespace-pre-wrap font-sans">{item.answer ?? "No answer"}</pre>
              {item.correctChoice ? <p className="mt-1 text-xs text-zinc-500">Correct choice: {item.correctChoice}</p> : null}
            </div>
            {item.grade?.quote && item.type !== "multiple_choice" ? <p className="mt-1 text-xs text-zinc-600">Grader evidence: “{item.grade.quote}”</p> : null}
            {item.grade?.overrideReason ? <p className="mt-1 text-xs text-zinc-600">Correction reason: {item.grade.overrideReason}</p> : null}
            {item.grade && gradingFinished ? (
              editing === item.id ? (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="flex flex-col text-xs">
                    Score (0–{item.max})
                    <input type="number" min={0} max={item.max} step={1} value={score} onChange={(event) => setScore(event.target.value)} className="w-20 rounded border px-2 py-1 text-sm" />
                  </label>
                  <label className="flex flex-1 flex-col text-xs">
                    Reason (required)
                    <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="rounded border px-2 py-1 text-sm" />
                  </label>
                  <button type="button" className="rounded bg-zinc-900 px-3 py-1 text-white" disabled={pending} onClick={() => void save(item)}>Save</button>
                  <button type="button" className="rounded border px-3 py-1" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-2 rounded border px-2 py-1 text-xs"
                  onClick={() => {
                    setEditing(item.id);
                    setScore(item.grade?.score !== null && item.grade?.score !== undefined ? String(item.grade.score) : "");
                    setReason("");
                  }}
                >
                  {item.grade.needsHuman ? "Grade" : "Correct grade"}
                </button>
              )
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

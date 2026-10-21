"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createJobAssessmentDraft,
  publishJobAssessment,
  regenerateJobAssessmentItem,
  saveJobAssessmentSettings,
} from "@/app/actions/generated-assessment-actions";

type Item = { id: string; type: string; prompt: string; requirement: string; rubricCriterion: string };

export default function AssessmentDraftEditor({
  jobId,
  jobTitle,
  assessmentId,
  status,
  timeLimitMinutes,
  drawCount,
  candidateInstructions,
  items,
}: {
  jobId: number;
  jobTitle: string;
  assessmentId: number | null;
  status: string;
  timeLimitMinutes: number;
  drawCount: number;
  candidateInstructions: string | null;
  items: Item[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(String(timeLimitMinutes));
  const [count, setCount] = useState(String(Math.min(drawCount, items.length || drawCount)));
  const [instructions, setInstructions] = useState(candidateInstructions ?? "");
  const [pending, setPending] = useState(false);
  const draft = status === "DRAFT" && assessmentId !== null;

  async function saveSettings() {
    if (!assessmentId) return;
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await saveJobAssessmentSettings({
      assessmentId,
      timeLimitMinutes: Number.parseInt(minutes, 10),
      drawCount: Number.parseInt(count, 10),
      candidateInstructions: instructions || null,
    });
    setPending(false);
    if (!result.ok) setError(result.error);
    else {
      setNotice("Settings saved.");
      router.refresh();
    }
  }

  return (
    <div>
      <p className="text-sm">
        <Link className="underline" href={`/dashboard/jobs/${jobId}/review`}>Review queue</Link> ·{" "}
        <Link className="underline" href={`/dashboard/jobs/${jobId}/screening`}>Screening setup</Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold">{jobTitle}</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Basic assessment {status.toLowerCase()} · {timeLimitMinutes} min · {drawCount} of {items.length} questions per candidate · unpublished drafts never
        reach candidates
      </p>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p> : null}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => {
            void createJobAssessmentDraft(jobId).then(() => router.refresh()).catch(() => setError("Could not generate a draft. Check the job has requirements and try again."));
          }}
        >
          {assessmentId ? "Generate new draft" : "Generate draft"}
        </button>
        {draft ? (
          <button
            type="button"
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
            onClick={() => {
              void publishJobAssessment(assessmentId).then(() => router.refresh()).catch(() => setError("Could not publish. Fix the items and try again."));
            }}
          >
            Publish
          </button>
        ) : null}
      </div>

      {assessmentId ? (
        <section className="mt-6 rounded-xl border border-zinc-200 p-4">
          <h2 className="font-semibold">Candidate settings</h2>
          <p className="text-xs text-zinc-500">
            A basic screen usually takes 15–20 minutes. Each candidate gets a random draw from the pool below.
            {draft ? "" : " Published versions are fixed; generate a new draft to change them."}
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex flex-col text-sm">
              Time limit (minutes)
              <input type="number" min={5} max={240} value={minutes} disabled={!draft} onChange={(event) => setMinutes(event.target.value)} className="mt-1 w-28 rounded border px-2 py-1" />
            </label>
            <label className="flex flex-col text-sm">
              Questions per candidate
              <input type="number" min={1} max={Math.max(1, items.length)} value={count} disabled={!draft} onChange={(event) => setCount(event.target.value)} className="mt-1 w-28 rounded border px-2 py-1" />
            </label>
          </div>
          <label className="mt-3 flex flex-col text-sm">
            Instructions and allowed resources (shown to candidates)
            <textarea value={instructions} disabled={!draft} onChange={(event) => setInstructions(event.target.value)} maxLength={2000} rows={3} className="mt-1 rounded border px-2 py-1" />
          </label>
          {draft ? (
            <button type="button" disabled={pending} onClick={() => void saveSettings()} className="mt-3 rounded border px-3 py-1 text-sm font-semibold">
              Save settings
            </button>
          ) : null}
        </section>
      ) : null}

      <ol className="mt-6 space-y-3">
        {items.map((item, index) => (
          <li key={item.id} className="rounded-xl border border-zinc-200 p-4">
            <p className="text-xs uppercase text-zinc-500">{index + 1}. {item.type} · {item.rubricCriterion}</p>
            <p className="mt-1 font-medium">{item.prompt}</p>
            <p className="mt-1 text-sm text-zinc-600">Tests: {item.requirement}</p>
            {draft ? (
              <button type="button" className="mt-2 text-sm underline" onClick={() => void regenerateJobAssessmentItem(assessmentId, item.id).then(() => router.refresh())}>
                Regenerate this item
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

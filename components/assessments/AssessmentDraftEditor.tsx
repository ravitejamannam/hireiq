"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createJobAssessmentDraft, publishJobAssessment, regenerateJobAssessmentItem } from "@/app/actions/generated-assessment-actions";

type Item = { id: string; type: string; prompt: string; requirement: string; rubricCriterion: string };

export default function AssessmentDraftEditor({
  jobId,
  jobTitle,
  assessmentId,
  status,
  timeLimitMinutes,
  items,
}: {
  jobId: number;
  jobTitle: string;
  assessmentId: number | null;
  status: string;
  timeLimitMinutes: number;
  items: Item[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <h1 className="text-2xl font-bold">{jobTitle}</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Assessment {status.toLowerCase()} · {timeLimitMinutes} min · unpublished drafts never reach candidates
      </p>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => {
            void createJobAssessmentDraft(jobId).then(() => router.refresh()).catch((cause) => setError(String(cause)));
          }}
        >
          Generate draft
        </button>
        {assessmentId && status === "DRAFT" ? (
          <button
            type="button"
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
            onClick={() => {
              void publishJobAssessment(assessmentId).then(() => router.refresh()).catch((cause) => setError(String(cause)));
            }}
          >
            Publish
          </button>
        ) : null}
      </div>
      <ol className="mt-6 space-y-3">
        {items.map((item, index) => (
          <li key={item.id} className="rounded-xl border border-zinc-200 p-4">
            <p className="text-xs uppercase text-zinc-500">{index + 1}. {item.type} · {item.rubricCriterion}</p>
            <p className="mt-1 font-medium">{item.prompt}</p>
            <p className="mt-1 text-sm text-zinc-600">Tests: {item.requirement}</p>
            {status === "DRAFT" && assessmentId ? (
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

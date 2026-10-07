"use client";

import { useState } from "react";

import { createRelevanceJudgment } from "@/app/actions/human-relevance-actions";

type HumanRelevancePanelProps = {
  applicationId: number;
  specificationId: number;
  jobTitle: string;
  candidateName: string;
  requirements: string[];
  evidence: Array<{ id: number; text: string }>;
};

export default function HumanRelevancePanel({
  applicationId,
  specificationId,
  jobTitle,
  candidateName,
  requirements,
  evidence,
}: HumanRelevancePanelProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [recorded, setRecorded] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  async function submit(label: "RELEVANT" | "NOT_RELEVANT") {
    setError("");
    setPending(true);
    try {
      const result = await createRelevanceJudgment({
        applicationId,
        jobSpecificationVersionId: specificationId,
        label,
        idempotencyKey,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRecorded(
        result.judgment.label === "RELEVANT"
          ? "Recorded: relevant. This did not change the pipeline."
          : "Recorded: not relevant. This did not change the pipeline.",
      );
    } catch {
      setError("Unable to record this relevance judgment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Human relevance</h2>
      <p className="mt-2 text-sm text-zinc-700">
        Based on the job requirements and the candidate evidence available for this
        application, is this application relevant to this job?
      </p>
      <p className="mt-2 text-sm text-zinc-600">
        This is a relevance judgment, not a hiring decision. It will not change the
        application&apos;s pipeline status.
      </p>
      <p className="mt-4 text-sm font-semibold text-zinc-900">{jobTitle}</p>
      <p className="text-sm text-zinc-700">{candidateName}</p>
      <div className="mt-4 space-y-2 text-sm text-zinc-700">
        {requirements.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <ul className="mt-4 space-y-2 text-sm text-zinc-700">
        {evidence.map((row) => (
          <li key={row.id} className="rounded-lg border border-zinc-200 p-3">
            {row.text || "Evidence record without text."}
          </li>
        ))}
      </ul>
      {error ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {recorded ? (
        <p className="mt-4 text-sm text-zinc-800" role="status">
          {recorded}
        </p>
      ) : null}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={pending || evidence.length === 0}
          onClick={() => void submit("RELEVANT")}
        >
          Relevant
        </button>
        <button
          type="button"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
          disabled={pending || evidence.length === 0}
          onClick={() => void submit("NOT_RELEVANT")}
        >
          Not relevant
        </button>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  generateCandidateIntelligence,
  rerunCandidateIntelligence,
} from "@/app/actions/candidate-intelligence-actions";
import type { SafeCandidateEvidence } from "@/lib/candidates/evidence/evidence-types";
import type { SafeCandidateIntelligenceRun } from "@/lib/candidates/intelligence/intelligence-types";

type CandidateIntelligencePanelProps = {
  candidateId: number;
  evidence: SafeCandidateEvidence[];
  runs: SafeCandidateIntelligenceRun[];
};

function captureDate(value: Date | string) {
  const iso = typeof value === "string" ? value : value.toISOString();
  return iso.slice(0, 10);
}

function evidenceLabel(item: SafeCandidateEvidence) {
  return `Evidence ${item.id} · ${item.sourceType}`;
}

export default function CandidateIntelligencePanel({
  candidateId,
  evidence,
  runs: initialRuns,
}: CandidateIntelligencePanelProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [runs, setRuns] = useState(initialRuns);

  const eligible = evidence.filter(
    (item) => !item.isRevoked && !item.isSuperseded,
  );

  async function handleGenerate(evidenceId: number, rerun: boolean) {
    setError("");
    setMessage("");
    setPendingId(evidenceId);

    try {
      const result = rerun
        ? await rerunCandidateIntelligence(candidateId, evidenceId)
        : await generateCandidateIntelligence(candidateId, evidenceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRuns((current) => {
        const without = current.filter((run) => run.id !== result.run.id);
        return [result.run, ...without];
      });
      setMessage(
        result.run.claims.length === 0
          ? "Intelligence run completed. No grounded claims were stored."
          : "Intelligence run completed. Claims are derived from evidence, not verified facts.",
      );
      router.refresh();
    } catch {
      setError("Unable to generate candidate intelligence.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Intelligence</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Derived claims from evidence text. Not verified facts, matching, or
        ranking. Resume files are not processed.
      </p>

      {error ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 text-sm text-zinc-700" role="status">
          {message}
        </p>
      ) : null}

      {eligible.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">
          No current evidence artifacts are available for extraction.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {eligible.map((item) => {
            const completed = runs.find(
              (run) =>
                run.evidenceId === item.id && run.status === "COMPLETED",
            );
            return (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 text-sm"
              >
                <p className="text-zinc-700">{evidenceLabel(item)}</p>
                <button
                  type="button"
                  onClick={() => void handleGenerate(item.id, Boolean(completed))}
                  disabled={pendingId !== null}
                  className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
                >
                  {pendingId === item.id
                    ? "Generating..."
                    : completed
                      ? "Re-run"
                      : "Generate intelligence"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {runs.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">
          No intelligence runs have been generated for this candidate.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {runs.map((run) => (
            <li
              key={run.id}
              className="rounded-lg border border-zinc-200 p-4 text-sm"
            >
              <p className="font-medium text-black">
                Run {run.id}
                <span className="font-normal text-zinc-600">
                  {" "}
                  · {run.status}
                </span>
              </p>
              <p className="mt-1 text-zinc-600">
                Evidence {run.evidenceId} · {run.extractorType} {run.extractorVersion} ·{" "}
                {run.modelProvider}/{run.modelName} · prompt {run.promptVersion}
              </p>
              <p className="mt-1 text-zinc-600">
                Created {captureDate(run.createdAt)}
                {run.completedAt ? ` · Completed ${captureDate(run.completedAt)}` : ""}
                {run.durationMs !== null ? ` · ${run.durationMs}ms` : ""}
                {run.errorCode ? ` · ${run.errorCode}` : ""}
              </p>
              {run.claims.length === 0 ? (
                <p className="mt-3 text-zinc-600">No claims stored for this run.</p>
              ) : (
                <ul className="mt-3 space-y-1 text-zinc-700">
                  {run.claims.map((claim) => (
                    <li key={claim.id}>
                      <span className="font-medium text-black">
                        {claim.claimType}
                      </span>
                      {": "}
                      {claim.value}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

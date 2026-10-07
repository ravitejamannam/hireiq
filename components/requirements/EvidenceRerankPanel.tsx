"use client";

import { useState } from "react";

import { rerankM10Run } from "@/app/actions/m11-rerank-actions";
import type { M11RerankRow } from "@/lib/rerank/m11-engine";
import { M11_RERANK_VERSION } from "@/lib/rerank/m11-versions";

type EvidenceRerankPanelProps = {
  jobId: number;
  hybridRuns: Array<{ id: number; retrievedCount: number }>;
  applicationLabels: Array<{ id: number; label: string }>;
};

export default function EvidenceRerankPanel({
  jobId,
  hybridRuns,
  applicationLabels,
}: EvidenceRerankPanelProps) {
  const [hybridRunId, setHybridRunId] = useState(hybridRuns[0] ? String(hybridRuns[0].id) : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<M11RerankRow[] | null>(null);

  async function handleRerank() {
    setError("");
    setPending(true);
    try {
      const result = await rerankM10Run(jobId, hybridRunId);
      if (!result.ok) {
        setRows(null);
        setError(result.error);
        return;
      }
      setRows(result.result.results);
    } catch {
      setError("Unable to rerank this M10 run.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">M11 evidence-aware reranking</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Reorders one completed M10 result using required-skill Matcher V2 states.{" "}
        {M11_RERANK_VERSION}. Not a hiring recommendation. This view is not saved.
      </p>
      {error ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-zinc-700">
          M10 run
          <select
            className="mt-1 block rounded-lg border border-zinc-300 px-3 py-2"
            value={hybridRunId}
            onChange={(event) => setHybridRunId(event.target.value)}
            disabled={hybridRuns.length === 0}
          >
            {hybridRuns.length === 0 ? (
              <option value="">No completed M10 run</option>
            ) : (
              hybridRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  #{run.id} · {run.retrievedCount} applications
                </option>
              ))
            )}
          </select>
        </label>
        <button
          type="button"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          disabled={pending || !hybridRunId}
          onClick={() => void handleRerank()}
        >
          {pending ? "Reranking…" : "Rerank M10 order"}
        </button>
      </div>
      {rows ? (
        <ol className="mt-4 space-y-2 text-sm text-zinc-700">
          {rows.map((row) => (
            <li key={row.applicationId}>
              <span className="font-semibold text-zinc-900">#{row.rerankRank}</span>{" "}
              {applicationLabels.find((label) => label.id === row.applicationId)?.label ??
                `Application #${row.applicationId}`}{" "}
              · was M10 #{row.m10Rank} · RRF {row.rrfScore} · contradicted{" "}
              {row.contradictedRequiredSkillCount} · supported {row.supportedRequiredSkillCount}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

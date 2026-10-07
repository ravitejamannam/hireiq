"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { runHybridRetrieval } from "@/app/actions/hybrid-retrieval-actions";
import type { HybridRetrievalPageData } from "@/lib/retrieval/hybrid-retrieval-types";
import { DEFAULT_HYBRID_RETRIEVAL_LIMIT } from "@/lib/retrieval/hybrid-retrieval-versions";

type HybridRetrievalPanelProps = {
  retrieval: HybridRetrievalPageData;
  applicationLabels: Array<{ id: number; label: string }>;
};

function applicationLabel(
  applicationId: number,
  labels: Array<{ id: number; label: string }>,
) {
  return labels.find((row) => row.id === applicationId)?.label ?? `Application #${applicationId}`;
}

export default function HybridRetrievalPanel({
  retrieval,
  applicationLabels,
}: HybridRetrievalPanelProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [runs, setRuns] = useState(retrieval.runs);
  const [lexicalRunId, setLexicalRunId] = useState(
    retrieval.lexicalRuns[0] ? String(retrieval.lexicalRuns[0].id) : "",
  );
  const [semanticRunId, setSemanticRunId] = useState(
    retrieval.semanticRuns[0] ? String(retrieval.semanticRuns[0].id) : "",
  );
  const [limit, setLimit] = useState(String(DEFAULT_HYBRID_RETRIEVAL_LIMIT));

  async function handleRun() {
    setError("");
    setMessage("");
    setPending(true);
    try {
      const result = await runHybridRetrieval(
        retrieval.jobId,
        lexicalRunId,
        semanticRunId,
        limit,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRuns((current) => [result.run, ...current.filter((run) => run.id !== result.run.id)]);
      setMessage(
        `Hybrid retrieval completed. ${result.run.retrievedCount} applications. RRF score is retrieval fusion, not a hiring recommendation.`,
      );
      router.refresh();
    } catch {
      setError("Unable to run hybrid retrieval.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Hybrid retrieval</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Fuses one completed lexical run and one completed semantic run with reciprocal rank fusion.
        This is retrieval fusion, not candidate quality, a matcher, or a hiring recommendation.
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
      <div className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-3">
        <label className="text-sm text-zinc-700">
          Lexical baseline run
          <select
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            value={lexicalRunId}
            onChange={(event) => setLexicalRunId(event.target.value)}
            disabled={retrieval.lexicalRuns.length === 0}
          >
            {retrieval.lexicalRuns.length === 0 ? (
              <option value="">No completed lexical run</option>
            ) : (
              retrieval.lexicalRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  #{run.id} · {run.retrievedCount} retrieved
                </option>
              ))
            )}
          </select>
        </label>
        <label className="text-sm text-zinc-700">
          Semantic baseline run
          <select
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            value={semanticRunId}
            onChange={(event) => setSemanticRunId(event.target.value)}
            disabled={retrieval.semanticRuns.length === 0}
          >
            {retrieval.semanticRuns.length === 0 ? (
              <option value="">No completed semantic run</option>
            ) : (
              retrieval.semanticRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  #{run.id} · {run.retrievedCount} retrieved
                </option>
              ))
            )}
          </select>
        </label>
        <label className="text-sm text-zinc-700">
          Limit (K)
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            inputMode="numeric"
          />
        </label>
      </div>
      <button
        type="button"
        className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        onClick={handleRun}
        disabled={pending || !lexicalRunId || !semanticRunId}
      >
        {pending ? "Fusing…" : "Run hybrid retrieval"}
      </button>
      <div className="mt-6 space-y-6">
        {runs.length === 0 ? (
          <p className="text-sm text-zinc-500">No hybrid retrieval snapshots.</p>
        ) : (
          runs.map((run) => (
            <article key={run.id} className="rounded-lg border border-zinc-200 p-4">
              <p className="text-sm font-semibold text-zinc-900">
                Run #{run.id} · {run.fusionVersion} · k={run.rrfK} · {run.retrievedCount} results
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Lexical run #{run.lexicalRunId} ({run.lexicalRetrievalVersion}) · Semantic run #
                {run.semanticRunId} ({run.semanticRetrievalVersion}) · limit {run.resultLimit}
              </p>
              {run.results.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">No applications in either baseline.</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {run.results.map((result) => (
                    <li key={result.id} className="text-sm text-zinc-700">
                      <span className="font-semibold text-zinc-900">#{result.rank}</span>{" "}
                      {applicationLabel(result.applicationId, applicationLabels)} · RRF score{" "}
                      {result.rrfScore} · baseline ranks M8 {result.lexicalRank ?? "—"} / M9{" "}
                      {result.semanticRank ?? "—"}
                      <span className="mt-1 block text-xs text-zinc-500">{result.whyRetrieved}</span>
                    </li>
                  ))}
                </ol>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

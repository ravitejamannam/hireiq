"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { runLexicalRetrieval } from "@/app/actions/lexical-retrieval-actions";
import type { LexicalRetrievalPageData } from "@/lib/retrieval/lexical-retrieval-types";
import { DEFAULT_LEXICAL_RETRIEVAL_LIMIT } from "@/lib/retrieval/lexical-retrieval-versions";

type LexicalRetrievalPanelProps = {
  retrieval: LexicalRetrievalPageData;
  applicationLabels: Array<{ id: number; label: string }>;
};

function applicationLabel(
  applicationId: number,
  labels: Array<{ id: number; label: string }>,
) {
  return (
    labels.find((row) => row.id === applicationId)?.label ??
    `Application #${applicationId}`
  );
}

export default function LexicalRetrievalPanel({
  retrieval,
  applicationLabels,
}: LexicalRetrievalPanelProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [runs, setRuns] = useState(retrieval.runs);
  const [specificationId, setSpecificationId] = useState(
    retrieval.publishedSpecs[0] ? String(retrieval.publishedSpecs[0].id) : "",
  );
  const [limit, setLimit] = useState(String(DEFAULT_LEXICAL_RETRIEVAL_LIMIT));

  async function handleRun() {
    setError("");
    setMessage("");
    setPending(true);
    try {
      const result = await runLexicalRetrieval(
        retrieval.jobId,
        specificationId,
        limit,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRuns((current) => {
        const without = current.filter((run) => run.id !== result.run.id);
        return [result.run, ...without];
      });
      setMessage(
        `Lexical retrieval completed. Searched ${result.run.searchedCount} applications, retrieved ${result.run.retrievedCount}. This is not a hiring recommendation.`,
      );
      router.refresh();
    } catch {
      setError("Unable to run lexical retrieval.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Lexical retrieval baseline</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Retrieves applications whose eligible evidence lexically overlaps
        structured job requirement terms. This is a recall-oriented baseline,
        not a quality score, matcher, or hiring recommendation.
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

      <div className="mt-4 grid max-w-xl gap-4 sm:grid-cols-2">
        <label className="text-sm text-zinc-700">
          Published specification
          <select
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            value={specificationId}
            onChange={(event) => setSpecificationId(event.target.value)}
            disabled={retrieval.publishedSpecs.length === 0}
          >
            {retrieval.publishedSpecs.length === 0 ? (
              <option value="">No published specification</option>
            ) : (
              retrieval.publishedSpecs.map((spec) => (
                <option key={spec.id} value={spec.id}>
                  v{spec.versionNumber} (#{spec.id})
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
        onClick={() => void handleRun()}
        disabled={pending || !specificationId}
        className="mt-4 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
      >
        {pending ? "Retrieving..." : "Run lexical retrieval"}
      </button>

      {runs.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">
          No lexical retrieval runs for this job yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {runs.map((run) => (
            <li key={run.id} className="rounded-lg border border-zinc-200 p-4 text-sm">
              <p className="font-medium text-black">
                Run {run.id}
                <span className="font-normal text-zinc-600"> · {run.status}</span>
              </p>
              <p className="mt-1 text-zinc-600">
                Method {run.retrievalVersion} · query {run.queryConstructionVersion} ·
                ontology {run.ontologyVersion} · K={run.resultLimit}
              </p>
              <p className="mt-1 text-zinc-600">
                Searched {run.searchedCount} · Retrieved {run.retrievedCount}
              </p>
              {run.results.length === 0 ? (
                <p className="mt-3 text-zinc-600">
                  No lexically overlapping applications at this limit.
                </p>
              ) : (
                <ul className="mt-3 space-y-2 text-zinc-700">
                  {run.results.map((row) => (
                    <li key={row.id}>
                      <span className="font-medium text-black">#{row.rank}</span>
                      {": "}
                      {applicationLabel(row.applicationId, applicationLabels)}
                      {" · lexical overlap "}
                      {row.lexicalScore}
                      {row.matchedTerms.length > 0
                        ? ` · ${row.matchedTerms.join(", ")}`
                        : ""}
                      <p className="text-zinc-600">{row.whyRetrieved}</p>
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

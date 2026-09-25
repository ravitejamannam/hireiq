"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { materializeEvidenceGraph } from "@/app/actions/evidence-graph-actions";
import type { EvidenceGraphPageData } from "@/lib/evidence-graph/evidence-graph-types";

type EvidenceGraphPanelProps = {
  graph: EvidenceGraphPageData;
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

export default function EvidenceGraphPanel({
  graph,
  applicationLabels,
}: EvidenceGraphPanelProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [runs, setRuns] = useState(graph.runs);
  const [specificationId, setSpecificationId] = useState(
    graph.publishedSpecs[0] ? String(graph.publishedSpecs[0].id) : "",
  );

  async function handleMaterialize() {
    setError("");
    setMessage("");
    setPending(true);
    try {
      const result = await materializeEvidenceGraph(graph.jobId, specificationId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRuns(result.runs);
      setMessage(
        `Materialized ${result.runs.length} evidence-graph snapshot(s). This is a provenance projection, not a rank or candidate quality score.`,
      );
      router.refresh();
    } catch {
      setError("Unable to materialize the evidence graph.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-300 bg-zinc-50/70 p-6">
      <h2 className="text-lg font-bold text-black">Candidate evidence graph</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Diagnostic projection of existing evidence, claims, requirements, and
        Matcher V2 citations. It is not T94 ranking, not M8 lexical retrieval,
        not M9 semantic retrieval, and not a hiring decision.
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

      <label className="mt-4 block max-w-xl text-sm text-zinc-700">
        Published specification
        <select
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
          value={specificationId}
          onChange={(event) => setSpecificationId(event.target.value)}
          disabled={graph.publishedSpecs.length === 0}
        >
          {graph.publishedSpecs.length === 0 ? (
            <option value="">No published specification</option>
          ) : (
            graph.publishedSpecs.map((spec) => (
              <option key={spec.id} value={spec.id}>
                v{spec.versionNumber} (#{spec.id})
              </option>
            ))
          )}
        </select>
      </label>

      <button
        type="button"
        onClick={() => void handleMaterialize()}
        disabled={pending || !specificationId}
        className="mt-4 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
      >
        {pending ? "Materializing..." : "Materialize evidence graph"}
      </button>

      {runs.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">
          No evidence-graph snapshots for this job yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {runs.map((run) => (
            <li key={run.id} className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
              <p className="font-medium text-black">
                {applicationLabel(run.applicationId, applicationLabels)}
                <span className="font-normal text-zinc-600">
                  {" "}
                  · run {run.id} · {run.status}
                </span>
              </p>
              <p className="mt-1 text-zinc-600">
                {run.graphVersion} · ontology {run.ontologyVersion}
                {run.matcherVersion ? ` · matcher ${run.matcherVersion}` : ""}
                {run.jobIntelligenceRunId
                  ? ` · job intel #${run.jobIntelligenceRunId}`
                  : " · no job intelligence"}
                {run.matcherV2RunId
                  ? ` · Matcher V2 #${run.matcherV2RunId}`
                  : " · no Matcher V2"}
              </p>
              {run.edges.length === 0 ? (
                <p className="mt-3 text-zinc-600">No derived relationships.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-zinc-700">
                  {run.edges.map((edge) => (
                    <li key={edge.id}>
                      <span className="font-medium text-black">{edge.edgeType}</span>
                      {`: ${edge.fromType} #${edge.fromId} → ${edge.toType} #${edge.toId}`}
                      <p className="text-zinc-600">
                        {edge.provenance}
                        {edge.sourceEvidenceId
                          ? ` · evidence #${edge.sourceEvidenceId}${
                              edge.evidenceActive ? "" : " (inactive)"
                            }`
                          : ""}
                      </p>
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

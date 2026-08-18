"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { JobRankingCoverageStatus, JobRankingRunStatus } from "@prisma/client";

import { runJobRanking } from "@/app/actions/candidate-ranking-actions";
import type {
  JobRankingPageData,
  SafeJobRankingRun,
} from "@/lib/candidates/ranking/ranking-types";

type JobRankingPanelProps = {
  ranking: JobRankingPageData;
  applicationLabels: Array<{ id: number; label: string }>;
};

function captureDate(value: Date | string) {
  const iso = typeof value === "string" ? value : value.toISOString();
  return iso.slice(0, 10);
}

function applicationLabel(
  applicationId: number,
  labels: Array<{ id: number; label: string }>,
) {
  return (
    labels.find((row) => row.id === applicationId)?.label ??
    `Application #${applicationId}`
  );
}

function resultExplanation(run: SafeJobRankingRun, applicationId: number) {
  const row = run.results.find((result) => result.applicationId === applicationId);
  if (!row) {
    return "";
  }
  if (row.coverageStatus === JobRankingCoverageStatus.UNRANKED_NO_MATCH) {
    return "No completed matching run was available for this application and specification.";
  }
  const sameCoverage = run.results.filter(
    (result) =>
      result.coverageStatus === JobRankingCoverageStatus.RANKED &&
      result.satisfiedSkillCount === row.satisfiedSkillCount,
  );
  const tie =
    sameCoverage.length > 1
      ? " Same evidence coverage; deterministic application-id tie-break."
      : "";
  return `Ranked #${row.rank} with ${row.satisfiedSkillCount} exact primary-skill evidence matches.${tie}`;
}

export default function JobRankingPanel({
  ranking,
  applicationLabels,
}: JobRankingPanelProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [runs, setRuns] = useState(ranking.runs);
  const [specificationId, setSpecificationId] = useState(
    ranking.publishedSpecs[0] ? String(ranking.publishedSpecs[0].id) : "",
  );

  async function handleRun() {
    setError("");
    setMessage("");
    setPending(true);
    try {
      const result = await runJobRanking(ranking.jobId, specificationId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRuns((current) => {
        const without = current.filter((run) => run.id !== result.run.id);
        return [result.run, ...without];
      });
      setMessage(
        "Evidence coverage ordering completed. This is not a measure of candidate quality.",
      );
      router.refresh();
    } catch {
      setError("Unable to run evidence coverage ranking.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Evidence Coverage</h2>
      <p className="mt-2 text-sm text-zinc-600">
        This ordering reflects exact primary-skill evidence matches available
        through the matching pipeline. It is not a measure of candidate quality
        or hiring suitability. Select an explicit published specification
        version. Ranking does not run automatically.
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

      <div className="mt-4 max-w-md">
        <label className="text-sm text-zinc-700">
          Published specification
          <select
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            value={specificationId}
            onChange={(event) => setSpecificationId(event.target.value)}
            disabled={ranking.publishedSpecs.length === 0}
          >
            {ranking.publishedSpecs.length === 0 ? (
              <option value="">No published specification</option>
            ) : (
              ranking.publishedSpecs.map((spec) => (
                <option key={spec.id} value={spec.id}>
                  v{spec.versionNumber} (#{spec.id})
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={() => void handleRun()}
        disabled={pending || !specificationId}
        className="mt-4 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
      >
        {pending ? "Ranking..." : "Run Evidence Coverage"}
      </button>

      {runs.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">
          No evidence coverage runs have been generated for this requirement.
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
                Spec {run.jobSpecificationVersionId} · policy{" "}
                {run.rankingPolicyVersion} · matcher {run.matcherVersion} · parse{" "}
                {run.requirementParseVersion} · alias {run.aliasMapVersion}
              </p>
              <p className="mt-1 text-zinc-600">
                Ranked {run.rankedCount} · Unranked {run.unrankedCount}
                {run.status === JobRankingRunStatus.FAILED && run.errorCode
                  ? ` · ${run.errorCode}`
                  : ""}
              </p>
              <p className="mt-1 text-zinc-600">
                Created {captureDate(run.createdAt)}
                {run.completedAt
                  ? ` · Completed ${captureDate(run.completedAt)}`
                  : ""}
              </p>
              {run.results.length === 0 ? (
                <p className="mt-3 text-zinc-600">No ranking result rows.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-zinc-700">
                  {run.results.map((row) => (
                    <li key={row.id}>
                      <span className="font-medium text-black">
                        {row.coverageStatus ===
                        JobRankingCoverageStatus.RANKED
                          ? `#${row.rank}`
                          : "Unranked"}
                      </span>
                      {": "}
                      {applicationLabel(row.applicationId, applicationLabels)}
                      {" · "}
                      {row.coverageStatus === JobRankingCoverageStatus.RANKED
                        ? `${row.satisfiedSkillCount} exact skill evidence matches · ${row.unknownSkillCount} with no exact supporting evidence · match run ${row.candidateMatchRunId}`
                        : "No completed matching run"}
                      <p className="text-zinc-600">
                        {resultExplanation(run, row.applicationId)}
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

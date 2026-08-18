"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { runCandidateMatching } from "@/app/actions/candidate-matching-actions";
import type {
  MatchingApplicationOption,
  SafeCandidateMatchRun,
} from "@/lib/candidates/matching/matching-types";

type CandidateMatchingPanelProps = {
  candidateId: number;
  applications: MatchingApplicationOption[];
  runs: SafeCandidateMatchRun[];
};

function captureDate(value: Date | string) {
  const iso = typeof value === "string" ? value : value.toISOString();
  return iso.slice(0, 10);
}

export default function CandidateMatchingPanel({
  candidateId,
  applications,
  runs: initialRuns,
}: CandidateMatchingPanelProps) {
  void candidateId;
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [runs, setRuns] = useState(initialRuns);
  const [applicationId, setApplicationId] = useState(
    applications[0] ? String(applications[0].id) : "",
  );

  const selectedApplication = useMemo(
    () =>
      applications.find((application) => String(application.id) === applicationId) ??
      null,
    [applicationId, applications],
  );

  const [specificationId, setSpecificationId] = useState(
    selectedApplication?.publishedSpecs[0]
      ? String(selectedApplication.publishedSpecs[0].id)
      : "",
  );

  const specs = selectedApplication?.publishedSpecs ?? [];

  async function handleRun() {
    setError("");
    setMessage("");
    setPending(true);
    try {
      const result = await runCandidateMatching(applicationId, specificationId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRuns((current) => {
        const without = current.filter((run) => run.id !== result.run.id);
        return [result.run, ...without];
      });
      setMessage(
        "Matching completed. Results are requirement-level, not a ranking.",
      );
      router.refresh();
    } catch {
      setError("Unable to run candidate matching.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Matching</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Deterministic Application ↔ published specification matching. Not ranking.
        Select an explicit published specification version.
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

      {applications.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">
          No applications are available to match.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-zinc-700">
            Application
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={applicationId}
              onChange={(event) => {
                const nextId = event.target.value;
                setApplicationId(nextId);
                const next = applications.find(
                  (application) => String(application.id) === nextId,
                );
                setSpecificationId(
                  next?.publishedSpecs[0] ? String(next.publishedSpecs[0].id) : "",
                );
              }}
            >
              {applications.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.jobTitle} (#{application.id})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-zinc-700">
            Published specification
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={specificationId}
              onChange={(event) => setSpecificationId(event.target.value)}
              disabled={specs.length === 0}
            >
              {specs.length === 0 ? (
                <option value="">No published specification</option>
              ) : (
                specs.map((spec) => (
                  <option key={spec.id} value={spec.id}>
                    v{spec.versionNumber} (#{spec.id})
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
      )}

      {applications.length > 0 ? (
        <button
          type="button"
          onClick={() => void handleRun()}
          disabled={pending || !specificationId}
          className="mt-4 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
        >
          {pending ? "Matching..." : "Run matching"}
        </button>
      ) : null}

      {runs.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">
          No matching runs have been generated for this candidate.
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
                <span className="font-normal text-zinc-600"> · {run.status}</span>
              </p>
              <p className="mt-1 text-zinc-600">
                Application {run.applicationId} · Spec {run.jobSpecificationVersionId}{" "}
                · matcher {run.matcherVersion} · parse {run.requirementParseVersion}{" "}
                · alias {run.aliasMapVersion}
              </p>
              <p className="mt-1 text-zinc-600">
                Created {captureDate(run.createdAt)}
                {run.completedAt ? ` · Completed ${captureDate(run.completedAt)}` : ""}
                {run.errorCode ? ` · ${run.errorCode}` : ""}
              </p>
              {run.requirementMatches.length === 0 ? (
                <p className="mt-3 text-zinc-600">No requirement rows.</p>
              ) : (
                <ul className="mt-3 space-y-1 text-zinc-700">
                  {run.requirementMatches.map((row) => (
                    <li key={row.id}>
                      <span className="font-medium text-black">{row.requirementKey}</span>
                      {": "}
                      {row.result} ({row.reasonCode})
                      {row.claimId
                        ? ` · claim ${row.claimId} / evidence ${row.evidenceId}`
                        : ""}
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

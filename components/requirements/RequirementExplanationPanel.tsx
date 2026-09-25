"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RequirementSupportState } from "@prisma/client";

import { runRequirementExplanation } from "@/app/actions/requirement-assessment-actions";
import type { RequirementExplanationPageData } from "@/lib/candidates/matching/matching-v2-types";

type RequirementExplanationPanelProps = {
  explanation: RequirementExplanationPageData;
};

function supportLabel(state: RequirementSupportState) {
  switch (state) {
    case RequirementSupportState.SUPPORTED:
      return "Supported";
    case RequirementSupportState.PARTIALLY_SUPPORTED:
      return "Partially supported";
    case RequirementSupportState.UNKNOWN:
      return "Unknown";
    case RequirementSupportState.CONTRADICTED:
      return "Contradicted";
    case RequirementSupportState.UNSUPPORTED:
      return "Unsupported";
    default:
      return state;
  }
}

export default function RequirementExplanationPanel({
  explanation,
}: RequirementExplanationPanelProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [page, setPage] = useState(explanation);
  const [specificationId, setSpecificationId] = useState(
    explanation.publishedSpecs[0] ? String(explanation.publishedSpecs[0].id) : "",
  );

  async function handleRun() {
    setError("");
    setMessage("");
    setPending(true);
    try {
      const result = await runRequirementExplanation(page.jobId, specificationId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPage(result.page);
      setMessage(
        "Requirement explanation refreshed from available evidence. This is not a hiring recommendation.",
      );
      router.refresh();
    } catch {
      setError("Unable to build the requirement explanation.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Why / Gap / Uncertainty</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Requirement-level evidence for this published specification. Matcher V2
        does not change application status and does not produce a match
        percentage. UNKNOWN means insufficient available evidence, not a
        rejection.
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
            disabled={page.publishedSpecs.length === 0}
          >
            {page.publishedSpecs.length === 0 ? (
              <option value="">No published specification</option>
            ) : (
              page.publishedSpecs.map((spec) => (
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
        {pending ? "Building explanation..." : "Build requirement explanation"}
      </button>

      {page.jobIntelligence ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-black">Job understanding</h3>
          <p className="mt-1 text-xs text-zinc-600">
            Intelligence run {page.jobIntelligence.runId} · extractor{" "}
            {page.jobIntelligence.extractorVersion}
          </p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700">
            {page.jobIntelligence.requirements.map((requirement) => (
              <li key={requirement.id}>
                <span className="font-medium text-black">
                  {requirement.category}
                </span>
                {": "}
                {requirement.sourceText}
                <span className="text-zinc-500">
                  {" "}
                  · {requirement.sourceField}
                  {requirement.uncertainty === "AMBIGUOUS" ? " · ambiguous" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-6 text-sm text-zinc-600">
          No job intelligence run yet. Build the explanation to extract
          requirements from the published specification.
        </p>
      )}

      <div className="mt-6 space-y-4">
        {page.applications.length === 0 ? (
          <p className="text-sm text-zinc-600">No applications on this job.</p>
        ) : (
          page.applications.map((application) => (
            <article
              key={application.applicationId}
              className="rounded-lg border border-zinc-200 p-4 text-sm"
            >
              <h3 className="font-medium text-black">
                {application.candidateName}
                <span className="font-normal text-zinc-600">
                  {" "}
                  · Application #{application.applicationId}
                </span>
              </h3>
              {!application.run ? (
                <p className="mt-2 text-zinc-600">
                  No Matcher V2 run for this application yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {application.run.assessments.map((row) => (
                    <li key={row.id}>
                      <p className="font-medium text-black">
                        {supportLabel(row.supportState)}
                        <span className="font-normal text-zinc-600">
                          {" "}
                          · {row.reasonCode}
                        </span>
                      </p>
                      <p className="text-zinc-700">Why: {row.why}</p>
                      {row.gap ? (
                        <p className="text-zinc-700">Gap: {row.gap}</p>
                      ) : null}
                      {row.uncertainty ? (
                        <p className="text-zinc-700">
                          Uncertainty: {row.uncertainty}
                        </p>
                      ) : null}
                      {row.evidenceSummary ? (
                        <p className="text-zinc-600">
                          Evidence: {row.evidenceSummary}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

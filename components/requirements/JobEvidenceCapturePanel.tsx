"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  attachRecruiterTextualEvidence,
  captureJobTextualEvidence,
  getJobEvidenceCapture,
} from "@/app/actions/candidate-evidence-capture-actions";
import type {
  JobEvidenceCapturePageData,
  JobEvidenceCaptureResult,
} from "@/lib/candidates/evidence-capture/evidence-capture-types";

type JobEvidenceCapturePanelProps = {
  capture: JobEvidenceCapturePageData;
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

function formatReasons(result: JobEvidenceCaptureResult) {
  const parts = Object.entries(result.reasons)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([reason, count]) => `${reason}: ${count}`);
  return parts.length > 0 ? parts.join(" · ") : "none";
}

export default function JobEvidenceCapturePanel({
  capture,
  applicationLabels,
}: JobEvidenceCapturePanelProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingJob, setPendingJob] = useState(false);
  const [pendingApplicationId, setPendingApplicationId] = useState<
    number | null
  >(null);
  const [lastResult, setLastResult] = useState<JobEvidenceCaptureResult | null>(
    null,
  );
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [reloaded, setReloaded] = useState<{
    jobId: number;
    applications: JobEvidenceCapturePageData["applications"];
  } | null>(null);
  const applicationRows =
    reloaded?.jobId === capture.jobId
      ? reloaded.applications
      : capture.applications;

  async function reloadApplicationRows() {
    const page = await getJobEvidenceCapture(capture.jobId);
    setReloaded({ jobId: page.jobId, applications: page.applications });
  }

  const applications = useMemo(
    () =>
      applicationRows.map((row) => ({
        ...row,
        label: applicationLabel(row.applicationId, applicationLabels),
      })),
    [applicationLabels, applicationRows],
  );

  async function handleJobCapture() {
    setError("");
    setMessage("");
    setPendingJob(true);
    try {
      const response = await captureJobTextualEvidence(capture.jobId);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setLastResult(response.result);
      await reloadApplicationRows();
      setMessage(
        "Evidence captured. Run Candidate Intelligence manually when ready.",
      );
      router.refresh();
    } catch {
      setError("Unable to capture textual evidence.");
    } finally {
      setPendingJob(false);
    }
  }

  async function handleAttach(applicationId: number) {
    setError("");
    setMessage("");
    setPendingApplicationId(applicationId);
    try {
      const response = await attachRecruiterTextualEvidence(
        capture.jobId,
        applicationId,
        drafts[applicationId] ?? "",
      );
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setDrafts((current) => ({ ...current, [applicationId]: "" }));
      await reloadApplicationRows();
      setMessage(
        response.result.reused
          ? "Identical recruiter-entered evidence already exists. Run Candidate Intelligence manually when ready."
          : "Evidence captured. Run Candidate Intelligence manually when ready.",
      );
      router.refresh();
    } catch {
      setError("Unable to attach textual candidate evidence.");
    } finally {
      setPendingApplicationId(null);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">
        Textual Evidence Capture
      </h2>
      <p className="mt-2 text-sm text-zinc-600">
        Materialize candidate-provided or application-provided text as evidence
        artifacts. This is not a verified fact, identity record, AI-generated
        claim, or profile update. Intelligence, matching, and ranking are not
        run automatically.
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

      {lastResult ? (
        <p className="mt-4 text-sm text-zinc-700" role="status">
          Captured {lastResult.captured} · Skipped {lastResult.skipped}
          {` · ${formatReasons(lastResult)}`}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleJobCapture()}
        disabled={pendingJob}
        className="mt-4 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
      >
        {pendingJob
          ? "Capturing..."
          : "Materialize available textual evidence for this job"}
      </button>

      {applications.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">
          No applications are available for this requirement.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {applications.map((application) => (
            <li
              key={application.applicationId}
              className="rounded-lg border border-zinc-200 p-4 text-sm"
            >
              <p className="font-medium text-black">{application.label}</p>
              <p className="mt-1 text-zinc-600">
                Evidence artifacts: {application.evidenceCount}
                {application.hasHostedApplyText
                  ? " · Hosted-apply text available"
                  : " · No hosted-apply text"}
              </p>
              <label className="mt-3 block text-zinc-700">
                Attach textual candidate evidence
                <textarea
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                  rows={3}
                  value={drafts[application.applicationId] ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [application.applicationId]: event.target.value,
                    }))
                  }
                  placeholder="Paste candidate-provided or recruiter-observed text. This becomes an evidence artifact."
                />
              </label>
              <button
                type="button"
                onClick={() => void handleAttach(application.applicationId)}
                disabled={pendingApplicationId === application.applicationId}
                className="mt-3 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
              >
                {pendingApplicationId === application.applicationId
                  ? "Attaching..."
                  : "Attach textual candidate evidence"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

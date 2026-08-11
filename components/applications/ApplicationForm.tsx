"use client";

import { useState } from "react";
import {
  ApplicationPipelineStatus,
  SourcingDatabaseSource,
} from "@prisma/client";
import type { getJobs } from "@/lib/repositories/job-repository";

export type ApplicationCandidateOption = {
  id: number;
  name: string;
  company: {
    id: number;
    name: string;
  };
};

type Job = Awaited<ReturnType<typeof getJobs>>[number];

export const APPLICATION_PIPELINE_STATUS_OPTIONS = [
  { value: ApplicationPipelineStatus.CV_POOL, label: "CV Pool" },
  { value: ApplicationPipelineStatus.EXPERT_REVIEW, label: "Expert Review" },
  {
    value: ApplicationPipelineStatus.TECH_EVALUATION,
    label: "Tech Evaluation",
  },
  { value: ApplicationPipelineStatus.SHORTLISTED, label: "Shortlisted" },
  { value: ApplicationPipelineStatus.SELECTED, label: "Selected" },
  { value: ApplicationPipelineStatus.REJECTED, label: "Rejected" },
  { value: ApplicationPipelineStatus.HIRED, label: "Hired" },
];

export const APPLICATION_SOURCE_OPTIONS = [
  { value: SourcingDatabaseSource.LINKEDIN, label: "LinkedIn" },
  { value: SourcingDatabaseSource.NAUKRI, label: "Naukri" },
];

export function getApplicationPipelineStatusLabel(
  status: ApplicationPipelineStatus,
) {
  return (
    APPLICATION_PIPELINE_STATUS_OPTIONS.find((option) => option.value === status)
      ?.label ?? status
  );
}

export function getApplicationSourceLabel(
  source: SourcingDatabaseSource | null,
) {
  if (!source) return "Not provided";

  return (
    APPLICATION_SOURCE_OPTIONS.find((option) => option.value === source)
      ?.label ?? source
  );
}

function isApplicationPipelineStatus(
  value: string,
): value is ApplicationPipelineStatus {
  return APPLICATION_PIPELINE_STATUS_OPTIONS.some(
    (option) => option.value === value,
  );
}

function isSourcingDatabaseSource(
  value: string,
): value is SourcingDatabaseSource {
  return APPLICATION_SOURCE_OPTIONS.some((option) => option.value === value);
}

export type ApplicationFormData = {
  candidateId: number;
  jobId: number;
  status: ApplicationPipelineStatus;
  source: SourcingDatabaseSource | null;
  expertScore: number | null;
  rejectionReason: string | null;
};

type ApplicationFormProps = {
  onCreate: (application: ApplicationFormData) => void;
  onCancel: () => void;
  candidates: ApplicationCandidateOption[];
  jobs: Job[];
  initialValues?: ApplicationFormData;
};

export default function ApplicationForm({
  onCreate,
  onCancel,
  candidates,
  jobs,
  initialValues,
}: ApplicationFormProps) {
  const [candidateId, setCandidateId] = useState(
    initialValues?.candidateId.toString() ?? "",
  );
  const [jobId, setJobId] = useState(initialValues?.jobId.toString() ?? "");
  const [status, setStatus] = useState<ApplicationPipelineStatus | "">(
    initialValues?.status ?? ApplicationPipelineStatus.CV_POOL,
  );
  const [source, setSource] = useState<SourcingDatabaseSource | "">(
    initialValues?.source ?? "",
  );
  const [expertScore, setExpertScore] = useState(
    initialValues?.expertScore?.toString() ?? "",
  );
  const [rejectionReason, setRejectionReason] = useState(
    initialValues?.rejectionReason ?? "",
  );

  const [candidateError, setCandidateError] = useState("");
  const [jobError, setJobError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [expertScoreError, setExpertScoreError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let valid = true;

    setCandidateError("");
    setJobError("");
    setStatusError("");
    setSourceError("");
    setExpertScoreError("");

    if (!candidateId.trim()) {
      setCandidateError("Candidate is required.");
      valid = false;
    }

    if (!jobId.trim()) {
      setJobError("Job is required.");
      valid = false;
    }

    let validatedStatus: ApplicationPipelineStatus | null = null;

    if (!status || !isApplicationPipelineStatus(status)) {
      setStatusError("Pipeline status is required.");
      valid = false;
    } else {
      validatedStatus = status;
    }

    if (source && !isSourcingDatabaseSource(source)) {
      setSourceError("Source is invalid.");
      valid = false;
    }

    const normalizedExpertScore = expertScore.trim();
    const expertScoreValue = normalizedExpertScore
      ? Number(normalizedExpertScore)
      : null;

    if (
      expertScoreValue !== null &&
      (!Number.isFinite(expertScoreValue) ||
        !Number.isInteger(expertScoreValue) ||
        expertScoreValue < 0)
    ) {
      setExpertScoreError("Expert score must be a non-negative integer.");
      valid = false;
    }

    if (!valid || !validatedStatus) return;

    onCreate({
      candidateId: Number(candidateId),
      jobId: Number(jobId),
      status: validatedStatus,
      source: source || null,
      expertScore: expertScoreValue,
      rejectionReason,
    });
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      <div>
        <label
          htmlFor="application-candidate"
          className="block text-sm font-medium text-black"
        >
          Candidate
        </label>

        <select
          id="application-candidate"
          value={candidateId}
          onChange={(event) => setCandidateId(event.target.value)}
          className="
            mt-2
            w-full
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-4
            py-3
            text-black
            outline-none
            transition
            focus:border-black
          "
        >
          <option value="">Select Candidate</option>

          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} - {candidate.company.name}
            </option>
          ))}
        </select>

        {candidateError && (
          <p className="mt-2 text-sm text-red-600">{candidateError}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="application-job"
          className="block text-sm font-medium text-black"
        >
          Job
        </label>

        <select
          id="application-job"
          value={jobId}
          onChange={(event) => setJobId(event.target.value)}
          className="
            mt-2
            w-full
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-4
            py-3
            text-black
            outline-none
            transition
            focus:border-black
          "
        >
          <option value="">Select Job</option>

          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title} - {job.company.name}
            </option>
          ))}
        </select>

        {jobError && <p className="mt-2 text-sm text-red-600">{jobError}</p>}
      </div>

      <div>
        <label
          htmlFor="application-status"
          className="block text-sm font-medium text-black"
        >
          Status
        </label>

        <select
          id="application-status"
          value={status}
          onChange={(event) => {
            const nextStatus = event.target.value;
            setStatus(
              isApplicationPipelineStatus(nextStatus) ? nextStatus : "",
            );
          }}
          className="
            mt-2
            w-full
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-4
            py-3
            text-black
            outline-none
            transition
            focus:border-black
          "
        >
          <option value="">Select pipeline status</option>
          {APPLICATION_PIPELINE_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {statusError && (
          <p className="mt-2 text-sm text-red-600">{statusError}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="application-source"
          className="block text-sm font-medium text-black"
        >
          Source
        </label>

        <select
          id="application-source"
          value={source}
          onChange={(event) => {
            const nextSource = event.target.value;
            setSource(isSourcingDatabaseSource(nextSource) ? nextSource : "");
          }}
          className="
            mt-2
            w-full
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-4
            py-3
            text-black
            outline-none
            transition
            focus:border-black
          "
        >
          <option value="">Not provided</option>
          {APPLICATION_SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {sourceError && (
          <p className="mt-2 text-sm text-red-600">{sourceError}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="application-expert-score"
          className="block text-sm font-medium text-black"
        >
          Expert Score
        </label>

        <input
          id="application-expert-score"
          type="number"
          min="0"
          step="1"
          value={expertScore}
          onChange={(event) => setExpertScore(event.target.value)}
          placeholder="Optional"
          className="
            mt-2
            w-full
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-4
            py-3
            text-black
            placeholder:text-zinc-400
            outline-none
            transition
            focus:border-black
          "
        />

        {expertScoreError && (
          <p className="mt-2 text-sm text-red-600">{expertScoreError}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="application-rejection-reason"
          className="block text-sm font-medium text-black"
        >
          Rejection Reason
        </label>

        <textarea
          id="application-rejection-reason"
          value={rejectionReason}
          onChange={(event) => setRejectionReason(event.target.value)}
          placeholder="Optional"
          rows={4}
          className="
            mt-2
            w-full
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-4
            py-3
            text-black
            placeholder:text-zinc-400
            outline-none
            transition
            focus:border-black
          "
        />
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-5
            py-3
            font-medium
            text-black
            transition
            hover:bg-zinc-100
          "
        >
          Cancel
        </button>

        <button
          type="submit"
          className="
            rounded-lg
            bg-black
            px-5
            py-3
            font-medium
            text-white
            transition
            hover:bg-zinc-800
          "
        >
          {initialValues ? "Save Changes" : "Create Application"}
        </button>
      </div>
    </form>
  );
}

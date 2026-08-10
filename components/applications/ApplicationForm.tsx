"use client";

import { useState } from "react";
import type { ApplicationStatus } from "@prisma/client";
import type { getCandidates } from "@/lib/repositories/candidate-repository";
import type { getJobs } from "@/lib/repositories/job-repository";

type Candidate = Awaited<ReturnType<typeof getCandidates>>[number];
type Job = Awaited<ReturnType<typeof getJobs>>[number];

export type ApplicationFormData = {
  candidateId: number;
  jobId: number;
  status: ApplicationStatus;
};

type ApplicationFormProps = {
  onCreate: (application: ApplicationFormData) => void;
  onCancel: () => void;
  candidates: Candidate[];
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
  const [status, setStatus] = useState(initialValues?.status ?? "");

  const [candidateError, setCandidateError] = useState("");
  const [jobError, setJobError] = useState("");
  const [statusError, setStatusError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let valid = true;

    setCandidateError("");
    setJobError("");
    setStatusError("");

    if (!candidateId.trim()) {
      setCandidateError("Candidate is required.");
      valid = false;
    }

    if (!jobId.trim()) {
      setJobError("Job is required.");
      valid = false;
    }

    if (!status.trim()) {
      setStatusError("Status is required.");
      valid = false;
    }

    if (!valid) return;

    onCreate({
      candidateId: Number(candidateId),
      jobId: Number(jobId),
      status: status as ApplicationStatus,
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
              {candidate.name}
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
          onChange={(event) =>
            setStatus(event.target.value as ApplicationStatus)
          }
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
          <option value="">Select Status</option>
          <option value="APPLIED">Applied</option>
          <option value="SCREENING">Screening</option>
          <option value="INTERVIEWING">Interviewing</option>
          <option value="OFFER">Offer</option>
          <option value="HIRED">Hired</option>
          <option value="REJECTED">Rejected</option>
        </select>

        {statusError && (
          <p className="mt-2 text-sm text-red-600">{statusError}</p>
        )}
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

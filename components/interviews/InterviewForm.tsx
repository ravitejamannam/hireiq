"use client";

import { useState } from "react";

type InterviewFormData = {
  candidate: string;
  company: string;
  interviewer: string;
  date: string;
  time: string;
  status: string;
};

type InterviewFormProps = {
  onCreate: (interview: InterviewFormData) => void;
  onCancel: () => void;
};

export default function InterviewForm({
  onCreate,
  onCancel,
}: InterviewFormProps) {
  const [candidate, setCandidate] = useState("");
  const [company, setCompany] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [status, setStatus] = useState("");

  const [candidateError, setCandidateError] = useState("");
  const [companyError, setCompanyError] = useState("");
  const [interviewerError, setInterviewerError] = useState("");
  const [dateError, setDateError] = useState("");
  const [timeError, setTimeError] = useState("");
  const [statusError, setStatusError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let valid = true;

    setCandidateError("");
    setCompanyError("");
    setInterviewerError("");
    setDateError("");
    setTimeError("");
    setStatusError("");

    if (!candidate.trim()) {
      setCandidateError("Candidate is required.");
      valid = false;
    }

    if (!company.trim()) {
      setCompanyError("Company is required.");
      valid = false;
    }

    if (!interviewer.trim()) {
      setInterviewerError("Interviewer is required.");
      valid = false;
    }

    if (!date) {
      setDateError("Date is required.");
      valid = false;
    }

    if (!time) {
      setTimeError("Time is required.");
      valid = false;
    }

    if (!status.trim()) {
      setStatusError("Status is required.");
      valid = false;
    }

    if (!valid) return;

    onCreate({
      candidate: candidate.trim(),
      company: company.trim(),
      interviewer: interviewer.trim(),
      date,
      time,
      status: status.trim(),
    });

    setCandidate("");
    setCompany("");
    setInterviewer("");
    setDate("");
    setTime("");
    setStatus("");

    setCandidateError("");
    setCompanyError("");
    setInterviewerError("");
    setDateError("");
    setTimeError("");
    setStatusError("");
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      <div>
        <label className="block text-sm font-medium text-black">
          Candidate
        </label>

        <input
          type="text"
          placeholder="Reddy"
          value={candidate}
          onChange={(event) => setCandidate(event.target.value)}
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

        {candidateError && (
          <p className="mt-2 text-sm text-red-600">{candidateError}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-black">Company</label>

        <input
          type="text"
          placeholder="Google"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
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

        {companyError && (
          <p className="mt-2 text-sm text-red-600">{companyError}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-black">
          Interviewer
        </label>

        <input
          type="text"
          placeholder="Alice Johnson"
          value={interviewer}
          onChange={(event) => setInterviewer(event.target.value)}
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

        {interviewerError && (
          <p className="mt-2 text-sm text-red-600">{interviewerError}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-black">Date</label>

        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
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
        />

        {dateError && <p className="mt-2 text-sm text-red-600">{dateError}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-black">Time</label>

        <input
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
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
        />

        {timeError && <p className="mt-2 text-sm text-red-600">{timeError}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-black">Status</label>

        <input
          type="text"
          placeholder="Scheduled"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
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
          Schedule Interview
        </button>
      </div>
    </form>
  );
}

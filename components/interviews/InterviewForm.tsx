"use client";

import { useState } from "react";
import type { InterviewResult, InterviewType } from "@prisma/client";
import type { getApplications } from "@/lib/repositories/application-repository";

type Application = Awaited<ReturnType<typeof getApplications>>[number];

export type InterviewFormData = {
  applicationId: number;
  type: InterviewType;
  interviewAt: Date;
  result: InterviewResult;
};

type InterviewFormProps = {
  onCreate: (interview: InterviewFormData) => void;
  onCancel: () => void;
  applications: Application[];
  initialValues?: {
    applicationId: number;
    type: InterviewType;
    interviewAt: Date;
    result: InterviewResult;
  };
};

function formatDateTimeLocalValue(value: Date) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function InterviewForm({
  onCreate,
  onCancel,
  applications,
  initialValues,
}: InterviewFormProps) {
  const [applicationId, setApplicationId] = useState(
    initialValues?.applicationId.toString() ?? "",
  );
  const [type, setType] = useState(initialValues?.type ?? "");
  const [interviewAt, setInterviewAt] = useState(
    initialValues ? formatDateTimeLocalValue(initialValues.interviewAt) : "",
  );
  const [result, setResult] = useState(initialValues?.result ?? "");

  const [applicationError, setApplicationError] = useState("");
  const [typeError, setTypeError] = useState("");
  const [interviewAtError, setInterviewAtError] = useState("");
  const [resultError, setResultError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let valid = true;

    setApplicationError("");
    setTypeError("");
    setInterviewAtError("");
    setResultError("");

    if (!applicationId.trim()) {
      setApplicationError("Application is required.");
      valid = false;
    }

    if (!type.trim()) {
      setTypeError("Interview type is required.");
      valid = false;
    }

    if (!interviewAt) {
      setInterviewAtError("Interview date and time are required.");
      valid = false;
    }

    if (!result.trim()) {
      setResultError("Result is required.");
      valid = false;
    }

    if (!valid) return;

    onCreate({
      applicationId: Number(applicationId),
      type: type as InterviewType,
      interviewAt: new Date(interviewAt),
      result: result as InterviewResult,
    });
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      <div>
        <label
          htmlFor="interview-application"
          className="block text-sm font-medium text-black"
        >
          Application
        </label>

        <select
          id="interview-application"
          value={applicationId}
          onChange={(event) => setApplicationId(event.target.value)}
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
        >
          <option value="">Select Application</option>
          {applications.map((application) => (
            <option key={application.id} value={application.id}>
              {application.candidate.name} - {application.job.title} -{" "}
              {application.job.company.name}
            </option>
          ))}
        </select>

        {applicationError && (
          <p className="mt-2 text-sm text-red-600">{applicationError}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="interview-type"
          className="block text-sm font-medium text-black"
        >
          Interview Type
        </label>

        <select
          id="interview-type"
          value={type}
          onChange={(event) => setType(event.target.value as InterviewType)}
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
        >
          <option value="">Select Interview Type</option>
          <option value="PHONE_SCREEN">Phone Screen</option>
          <option value="TECHNICAL">Technical</option>
          <option value="SYSTEM_DESIGN">System Design</option>
          <option value="HR">HR</option>
        </select>

        {typeError && (
          <p className="mt-2 text-sm text-red-600">{typeError}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="interview-date-time"
          className="block text-sm font-medium text-black"
        >
          Interview Date & Time
        </label>

        <input
          id="interview-date-time"
          type="datetime-local"
          value={interviewAt}
          onChange={(event) => setInterviewAt(event.target.value)}
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

        {interviewAtError && (
          <p className="mt-2 text-sm text-red-600">{interviewAtError}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="interview-result"
          className="block text-sm font-medium text-black"
        >
          Result
        </label>

        <select
          id="interview-result"
          value={result}
          onChange={(event) => setResult(event.target.value as InterviewResult)}
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
        >
          <option value="">Select Result</option>
          <option value="PENDING">Pending</option>
          <option value="PASSED">Passed</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        {resultError && (
          <p className="mt-2 text-sm text-red-600">{resultError}</p>
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
          {initialValues ? "Save Changes" : "Create Interview"}
        </button>
      </div>
    </form>
  );
}

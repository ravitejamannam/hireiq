"use client";

import { useState } from "react";
import type { CodingTestStatus } from "@prisma/client";
import type { getApplications } from "@/lib/repositories/application-repository";

type Application = Awaited<ReturnType<typeof getApplications>>[number];

export type CodingTestFormData = {
  applicationId: number;
  title: string;
  score: number;
  maxScore: number;
  status: CodingTestStatus;
  takenAt: Date;
};

type CodingTestFormProps = {
  onCreate: (codingTest: CodingTestFormData) => void;
  onCancel: () => void;
  applications: Application[];
  initialValues?: {
    applicationId: number;
    title: string;
    score: number;
    maxScore: number;
    status: CodingTestStatus;
    takenAt: Date;
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

export default function CodingTestForm({
  onCreate,
  onCancel,
  applications,
  initialValues,
}: CodingTestFormProps) {
  const [applicationId, setApplicationId] = useState(
    initialValues?.applicationId.toString() ?? "",
  );
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [score, setScore] = useState(
    initialValues ? initialValues.score.toString() : "",
  );
  const [maxScore, setMaxScore] = useState(
    initialValues ? initialValues.maxScore.toString() : "",
  );
  const [status, setStatus] = useState(initialValues?.status ?? "");
  const [takenAt, setTakenAt] = useState(
    initialValues ? formatDateTimeLocalValue(initialValues.takenAt) : "",
  );

  const [applicationError, setApplicationError] = useState("");
  const [titleError, setTitleError] = useState("");
  const [scoreError, setScoreError] = useState("");
  const [maxScoreError, setMaxScoreError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [takenAtError, setTakenAtError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let valid = true;

    setApplicationError("");
    setTitleError("");
    setScoreError("");
    setMaxScoreError("");
    setStatusError("");
    setTakenAtError("");

    const parsedScore = Number(score);
    const parsedMaxScore = Number(maxScore);

    if (!applicationId.trim()) {
      setApplicationError("Application is required.");
      valid = false;
    }

    if (!title.trim()) {
      setTitleError("Test title is required.");
      valid = false;
    }

    if (!score.trim()) {
      setScoreError("Score is required.");
      valid = false;
    } else if (Number.isNaN(parsedScore) || parsedScore < 0) {
      setScoreError("Score must be 0 or greater.");
      valid = false;
    }

    if (!maxScore.trim()) {
      setMaxScoreError("Maximum score is required.");
      valid = false;
    } else if (Number.isNaN(parsedMaxScore) || parsedMaxScore <= 0) {
      setMaxScoreError("Maximum score must be greater than 0.");
      valid = false;
    }

    if (
      score.trim() &&
      maxScore.trim() &&
      !Number.isNaN(parsedScore) &&
      !Number.isNaN(parsedMaxScore) &&
      parsedScore > parsedMaxScore
    ) {
      setScoreError("Score cannot be greater than maximum score.");
      valid = false;
    }

    if (!status.trim()) {
      setStatusError("Status is required.");
      valid = false;
    }

    if (!takenAt) {
      setTakenAtError("Taken date and time are required.");
      valid = false;
    }

    if (!valid) return;

    onCreate({
      applicationId: Number(applicationId),
      title: title.trim(),
      score: parsedScore,
      maxScore: parsedMaxScore,
      status: status as CodingTestStatus,
      takenAt: new Date(takenAt),
    });
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      <div>
        <label
          htmlFor="coding-test-application"
          className="block text-sm font-medium text-black"
        >
          Application
        </label>

        <select
          id="coding-test-application"
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
          htmlFor="coding-test-title"
          className="block text-sm font-medium text-black"
        >
          Test Title
        </label>

        <input
          id="coding-test-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Backend Assessment"
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

        {titleError && <p className="mt-2 text-sm text-red-600">{titleError}</p>}
      </div>

      <div>
        <label
          htmlFor="coding-test-score"
          className="block text-sm font-medium text-black"
        >
          Score
        </label>

        <input
          id="coding-test-score"
          type="number"
          value={score}
          onChange={(event) => setScore(event.target.value)}
          placeholder="80"
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

        {scoreError && <p className="mt-2 text-sm text-red-600">{scoreError}</p>}
      </div>

      <div>
        <label
          htmlFor="coding-test-max-score"
          className="block text-sm font-medium text-black"
        >
          Maximum Score
        </label>

        <input
          id="coding-test-max-score"
          type="number"
          value={maxScore}
          onChange={(event) => setMaxScore(event.target.value)}
          placeholder="100"
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

        {maxScoreError && (
          <p className="mt-2 text-sm text-red-600">{maxScoreError}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="coding-test-status"
          className="block text-sm font-medium text-black"
        >
          Status
        </label>

        <select
          id="coding-test-status"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as CodingTestStatus)
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
          <option value="PENDING">Pending</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
        </select>

        {statusError && (
          <p className="mt-2 text-sm text-red-600">{statusError}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="coding-test-taken-at"
          className="block text-sm font-medium text-black"
        >
          Taken Date & Time
        </label>

        <input
          id="coding-test-taken-at"
          type="datetime-local"
          value={takenAt}
          onChange={(event) => setTakenAt(event.target.value)}
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

        {takenAtError && (
          <p className="mt-2 text-sm text-red-600">{takenAtError}</p>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-zinc-300 text-black px-5 py-3"
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
          {initialValues ? "Save Changes" : "Create Coding Test"}
        </button>
      </div>
    </form>
  );
}

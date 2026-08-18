"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CodingTestStatus } from "@prisma/client";

import {
  createCodingTest,
  deleteCodingTest,
  updateCodingTest,
} from "@/app/actions/coding-test-actions";
import {
  formatClientDateTime,
  getClientCodingTestStatusLabel,
} from "@/components/client/client-labels";

type CodingTestRecord = {
  id: number;
  title: string;
  score: number;
  maxScore: number;
  status: CodingTestStatus;
  takenAt: Date | string;
};

type InterviewerCodingTestPanelProps = {
  applicationId: number;
  codingTests: CodingTestRecord[];
};

const CODING_TEST_STATUSES: CodingTestStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
];

const inputClassName =
  "mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-black disabled:bg-zinc-100";

function formatDateTimeLocal(value: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Coding test could not be saved.";
}

export default function InterviewerCodingTestPanel({
  applicationId,
  codingTests,
}: InterviewerCodingTestPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [status, setStatus] = useState<CodingTestStatus | "">("");
  const [takenAt, setTakenAt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setScore("");
    setMaxScore("");
    setStatus("");
    setTakenAt("");
  }

  function startCreate() {
    setErrorMessage(null);
    setEditingId("new");
    setTitle("");
    setScore("");
    setMaxScore("100");
    setStatus("PENDING");
    setTakenAt("");
  }

  function startEdit(codingTest: CodingTestRecord) {
    setErrorMessage(null);
    setEditingId(codingTest.id);
    setTitle(codingTest.title);
    setScore(String(codingTest.score));
    setMaxScore(String(codingTest.maxScore));
    setStatus(codingTest.status);
    setTakenAt(formatDateTimeLocal(codingTest.takenAt));
  }

  function handleSave() {
    const parsedScore = Number(score);
    const parsedMaxScore = Number(maxScore);

    if (!title.trim() || !status || !takenAt) {
      setErrorMessage("Title, status, and taken date and time are required.");
      return;
    }

    if (!Number.isInteger(parsedScore) || parsedScore < 0) {
      setErrorMessage("Score must be 0 or greater.");
      return;
    }

    if (!Number.isInteger(parsedMaxScore) || parsedMaxScore <= 0) {
      setErrorMessage("Maximum score must be a positive integer.");
      return;
    }

    setErrorMessage(null);
    const taken = new Date(takenAt);
    setBusy(editingId === "new" ? "create" : `save-${editingId}`);

    startTransition(async () => {
      try {
        if (editingId === "new") {
          await createCodingTest(
            applicationId,
            title.trim(),
            parsedScore,
            parsedMaxScore,
            status,
            taken,
          );
        } else if (typeof editingId === "number") {
          await updateCodingTest(
            editingId,
            applicationId,
            title.trim(),
            parsedScore,
            parsedMaxScore,
            status,
            taken,
          );
        }
        resetForm();
        router.refresh();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setBusy(null);
      }
    });
  }

  function handleDelete(codingTestId: number) {
    setErrorMessage(null);
    setBusy(`delete-${codingTestId}`);

    startTransition(async () => {
      try {
        await deleteCodingTest(codingTestId);
        if (editingId === codingTestId) {
          resetForm();
        }
        router.refresh();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setBusy(null);
      }
    });
  }

  const isEditing = editingId !== null;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-black">Coding tests</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Record coding assessments for this candidate.
          </p>
        </div>
        {!isEditing ? (
          <button
            type="button"
            disabled={isPending}
            onClick={startCreate}
            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            Add coding test
          </button>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {codingTests.length === 0 && !isEditing ? (
        <p className="mt-4 text-sm text-zinc-600">
          No coding tests recorded for this application.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {codingTests.map((codingTest) => (
            <article
              key={codingTest.id}
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"
            >
              <dl className="grid gap-3 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="font-medium text-black">Title</dt>
                  <dd>{codingTest.title}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Score</dt>
                  <dd>
                    {codingTest.score} / {codingTest.maxScore}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Status</dt>
                  <dd>{getClientCodingTestStatusLabel(codingTest.status)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Taken</dt>
                  <dd>{formatClientDateTime(new Date(codingTest.takenAt))}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startEdit(codingTest)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-zinc-100 disabled:opacity-60"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleDelete(codingTest.id)}
                  className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  {busy === `delete-${codingTest.id}` ? "Deleting..." : "Delete"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {isEditing ? (
        <div className="mt-6 rounded-lg border border-zinc-200 p-4">
          <h3 className="text-sm font-medium text-black">
            {editingId === "new" ? "New coding test" : "Edit coding test"}
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="coding-test-title" className="text-sm font-medium text-black">
                Title
              </label>
              <input
                id="coding-test-title"
                value={title}
                disabled={isPending}
                onChange={(event) => setTitle(event.target.value)}
                className={inputClassName}
              />
            </div>
            <div>
              <label htmlFor="coding-test-score" className="text-sm font-medium text-black">
                Score
              </label>
              <input
                id="coding-test-score"
                type="number"
                min={0}
                step={1}
                value={score}
                disabled={isPending}
                onChange={(event) => setScore(event.target.value)}
                className={inputClassName}
              />
            </div>
            <div>
              <label
                htmlFor="coding-test-max-score"
                className="text-sm font-medium text-black"
              >
                Maximum score
              </label>
              <input
                id="coding-test-max-score"
                type="number"
                min={1}
                step={1}
                value={maxScore}
                disabled={isPending}
                onChange={(event) => setMaxScore(event.target.value)}
                className={inputClassName}
              />
            </div>
            <div>
              <label
                htmlFor="coding-test-status"
                className="text-sm font-medium text-black"
              >
                Status
              </label>
              <select
                id="coding-test-status"
                value={status}
                disabled={isPending}
                onChange={(event) =>
                  setStatus(event.target.value as CodingTestStatus)
                }
                className={inputClassName}
              >
                <option value="">Select status</option>
                {CODING_TEST_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {getClientCodingTestStatusLabel(value)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="coding-test-taken-at"
                className="text-sm font-medium text-black"
              >
                Taken date & time
              </label>
              <input
                id="coding-test-taken-at"
                type="datetime-local"
                value={takenAt}
                disabled={isPending}
                onChange={(event) => setTakenAt(event.target.value)}
                className={inputClassName}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={handleSave}
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {busy === "create" || busy?.startsWith("save-")
                ? "Saving..."
                : "Save coding test"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={resetForm}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-100 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { InterviewResult, InterviewType } from "@prisma/client";

import {
  createInterview,
  deleteInterview,
  updateInterview,
} from "@/app/actions/interview-actions";
import {
  formatClientDateTime,
  getClientInterviewResultLabel,
  getClientInterviewTypeLabel,
} from "@/components/client/client-labels";

type InterviewRecord = {
  id: number;
  type: InterviewType;
  interviewAt: Date | string;
  result: InterviewResult;
};

type InterviewerInterviewPanelProps = {
  applicationId: number;
  interviews: InterviewRecord[];
};

const INTERVIEW_TYPES: InterviewType[] = [
  "PHONE_SCREEN",
  "TECHNICAL",
  "SYSTEM_DESIGN",
  "HR",
];

const INTERVIEW_RESULTS: InterviewResult[] = [
  "PENDING",
  "PASSED",
  "FAILED",
  "CANCELLED",
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
  return error instanceof Error ? error.message : "Interview could not be saved.";
}

export default function InterviewerInterviewPanel({
  applicationId,
  interviews,
}: InterviewerInterviewPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [type, setType] = useState<InterviewType | "">("");
  const [interviewAt, setInterviewAt] = useState("");
  const [result, setResult] = useState<InterviewResult | "">("");
  const [busy, setBusy] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null);
    setType("");
    setInterviewAt("");
    setResult("");
  }

  function startCreate() {
    setErrorMessage(null);
    setEditingId("new");
    setType("");
    setInterviewAt("");
    setResult("PENDING");
  }

  function startEdit(interview: InterviewRecord) {
    setErrorMessage(null);
    setEditingId(interview.id);
    setType(interview.type);
    setInterviewAt(formatDateTimeLocal(interview.interviewAt));
    setResult(interview.result);
  }

  function handleSave() {
    if (!type || !result || !interviewAt) {
      setErrorMessage("Type, date and time, and result are required.");
      return;
    }

    setErrorMessage(null);
    const scheduledAt = new Date(interviewAt);
    setBusy(editingId === "new" ? "create" : `save-${editingId}`);

    startTransition(async () => {
      try {
        if (editingId === "new") {
          await createInterview(applicationId, type, scheduledAt, result);
        } else if (typeof editingId === "number") {
          await updateInterview(
            editingId,
            applicationId,
            type,
            scheduledAt,
            result,
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

  function handleDelete(interviewId: number) {
    setErrorMessage(null);
    setBusy(`delete-${interviewId}`);

    startTransition(async () => {
      try {
        await deleteInterview(interviewId);
        if (editingId === interviewId) {
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
          <h2 className="text-lg font-bold text-black">Interviews</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Record interview rounds for this candidate.
          </p>
        </div>
        {!isEditing ? (
          <button
            type="button"
            disabled={isPending}
            onClick={startCreate}
            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            Add interview
          </button>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {interviews.length === 0 && !isEditing ? (
        <p className="mt-4 text-sm text-zinc-600">
          No interviews recorded for this application.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {interviews.map((interview) => (
            <article
              key={interview.id}
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"
            >
              <dl className="grid gap-3 text-sm text-zinc-600 sm:grid-cols-3">
                <div>
                  <dt className="font-medium text-black">Type</dt>
                  <dd>{getClientInterviewTypeLabel(interview.type)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Scheduled</dt>
                  <dd>{formatClientDateTime(new Date(interview.interviewAt))}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Result</dt>
                  <dd>{getClientInterviewResultLabel(interview.result)}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startEdit(interview)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-zinc-100 disabled:opacity-60"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleDelete(interview.id)}
                  className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  {busy === `delete-${interview.id}` ? "Deleting..." : "Delete"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {isEditing ? (
        <div className="mt-6 rounded-lg border border-zinc-200 p-4">
          <h3 className="text-sm font-medium text-black">
            {editingId === "new" ? "New interview" : "Edit interview"}
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="interview-type" className="text-sm font-medium text-black">
                Type
              </label>
              <select
                id="interview-type"
                value={type}
                disabled={isPending}
                onChange={(event) =>
                  setType(event.target.value as InterviewType)
                }
                className={inputClassName}
              >
                <option value="">Select type</option>
                {INTERVIEW_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {getClientInterviewTypeLabel(value)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="interview-at"
                className="text-sm font-medium text-black"
              >
                Date & time
              </label>
              <input
                id="interview-at"
                type="datetime-local"
                value={interviewAt}
                disabled={isPending}
                onChange={(event) => setInterviewAt(event.target.value)}
                className={inputClassName}
              />
            </div>
            <div>
              <label
                htmlFor="interview-result"
                className="text-sm font-medium text-black"
              >
                Result
              </label>
              <select
                id="interview-result"
                value={result}
                disabled={isPending}
                onChange={(event) =>
                  setResult(event.target.value as InterviewResult)
                }
                className={inputClassName}
              >
                <option value="">Select result</option>
                {INTERVIEW_RESULTS.map((value) => (
                  <option key={value} value={value}>
                    {getClientInterviewResultLabel(value)}
                  </option>
                ))}
              </select>
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
                : "Save interview"}
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

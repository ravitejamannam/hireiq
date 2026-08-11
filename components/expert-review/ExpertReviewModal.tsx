"use client";

import { useState } from "react";
import type { SourcingDatabaseSource } from "@prisma/client";

import {
  getApplicationSourceLabel,
} from "@/components/applications/ApplicationForm";

type ExpertReviewModalProps = {
  isOpen: boolean;
  candidateName: string;
  role: string;
  currentEmployer: string | null;
  location: string | null;
  experienceYears: number;
  skills: string | null;
  expectedCTC: string | null;
  source: SourcingDatabaseSource | null;
  jobTitle: string;
  companyName: string;
  assignedInterviewerName: string | null;
  initialExpertScore: number | null;
  initialNotes: string | null;
  hasEvaluation: boolean;
  isSaving?: boolean;
  errorMessage?: string;
  onClose: () => void;
  onSave: (expertScore: number | null, notes: string | null) => Promise<void>;
};

function formatOptional(value: string | number | null) {
  if (value === null || value === "") {
    return "Not provided";
  }

  return value;
}

export default function ExpertReviewModal({
  isOpen,
  candidateName,
  role,
  currentEmployer,
  location,
  experienceYears,
  skills,
  expectedCTC,
  source,
  jobTitle,
  companyName,
  assignedInterviewerName,
  initialExpertScore,
  initialNotes,
  hasEvaluation,
  isSaving = false,
  errorMessage = "",
  onClose,
  onSave,
}: ExpertReviewModalProps) {
  const [expertScore, setExpertScore] = useState(
    initialExpertScore?.toString() ?? "",
  );
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [scoreError, setScoreError] = useState("");

  if (!isOpen) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScoreError("");

    let parsedScore: number | null = null;

    if (expertScore.trim()) {
      const value = Number(expertScore);
      if (!Number.isInteger(value) || value < 0) {
        setScoreError("Expert score must be a non-negative integer.");
        return;
      }
      parsedScore = value;
    }

    const normalizedNotes = notes.trim() || null;

    await onSave(parsedScore, normalizedNotes);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Expert Review
            </p>
            <h2 className="mt-2 text-2xl font-bold text-black">{candidateName}</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {jobTitle} — {companyName}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close expert review"
            onClick={onClose}
            className="text-2xl text-zinc-500 hover:text-black"
          >
            ×
          </button>
        </div>

        <dl className="mt-6 grid gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-black">Role</dt>
            <dd>{role}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Current employer</dt>
            <dd>{formatOptional(currentEmployer)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Location</dt>
            <dd>{formatOptional(location)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Experience</dt>
            <dd>{experienceYears} years</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-black">Skills</dt>
            <dd>{formatOptional(skills)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Expected CTC</dt>
            <dd>{formatOptional(expectedCTC)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Source</dt>
            <dd>{getApplicationSourceLabel(source)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-black">Assigned interviewer</dt>
            <dd>{assignedInterviewerName || "Not assigned"}</dd>
          </div>
          {hasEvaluation && (
            <div className="sm:col-span-2">
              <dt className="font-medium text-black">Evaluation</dt>
              <dd>Evaluation recorded</dd>
            </div>
          )}
        </dl>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {errorMessage && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </p>
          )}

          <div>
            <label
              htmlFor="expert-score"
              className="block text-sm font-medium text-black"
            >
              Expert Score
            </label>
            <input
              id="expert-score"
              type="number"
              min={0}
              step={1}
              value={expertScore}
              onChange={(event) => setExpertScore(event.target.value)}
              disabled={isSaving}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black disabled:cursor-not-allowed disabled:bg-zinc-50"
            />
            {scoreError && (
              <p className="mt-2 text-sm text-red-600">{scoreError}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="expert-notes"
              className="block text-sm font-medium text-black"
            >
              Expert Notes
            </label>
            <textarea
              id="expert-notes"
              rows={5}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={isSaving}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black disabled:cursor-not-allowed disabled:bg-zinc-50"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save Review"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

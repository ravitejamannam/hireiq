"use client";

import { useState } from "react";
import {
  EvaluationFitDecision,
  Recommendation,
} from "@prisma/client";
import type { getApplications } from "@/lib/repositories/application-repository";
import type { getInterviewers } from "@/lib/repositories/interviewer-repository";

type Application = Awaited<ReturnType<typeof getApplications>>[number];
type Interviewer = Awaited<ReturnType<typeof getInterviewers>>[number];

export const RECOMMENDATION_OPTIONS = [
  { value: Recommendation.STRONG_HIRE, label: "Strong Hire" },
  { value: Recommendation.HIRE, label: "Hire" },
  { value: Recommendation.NO_HIRE, label: "No Hire" },
  { value: Recommendation.STRONG_NO_HIRE, label: "Strong No Hire" },
] as const;

export const FIT_DECISION_OPTIONS = [
  { value: EvaluationFitDecision.RIGHT_FIT, label: "Right Fit" },
  { value: EvaluationFitDecision.NOT_FIT, label: "Not Fit" },
] as const;

export function getRecommendationLabel(
  recommendation: Recommendation | null,
) {
  if (!recommendation) return "Not provided";

  return (
    RECOMMENDATION_OPTIONS.find((option) => option.value === recommendation)
      ?.label ?? recommendation
  );
}

export function getFitDecisionLabel(
  fitDecision: EvaluationFitDecision | null,
) {
  if (!fitDecision) return "Not provided";

  return (
    FIT_DECISION_OPTIONS.find((option) => option.value === fitDecision)
      ?.label ?? fitDecision
  );
}

export function formatApplicationOptionLabel(application: Application) {
  return `${application.candidate.name} — ${application.candidate.role} — ${application.candidate.company.name}`;
}

export function formatInterviewerOptionLabel(interviewer: Interviewer) {
  return `${interviewer.name} — ${interviewer.category} — ${interviewer.availability}`;
}

export function scorecardToFormValue(scorecard: unknown) {
  if (scorecard == null) return "";
  if (typeof scorecard === "string") return scorecard;
  try {
    return JSON.stringify(scorecard);
  } catch {
    return String(scorecard);
  }
}

function formatDateTimeLocalValue(value: Date) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function isRecommendation(value: string): value is Recommendation {
  return RECOMMENDATION_OPTIONS.some((option) => option.value === value);
}

function isFitDecision(value: string): value is EvaluationFitDecision {
  return FIT_DECISION_OPTIONS.some((option) => option.value === value);
}

export type EvaluationFormData = {
  applicationId: number;
  interviewerId: number;
  overallScore: number | null;
  scorecard: string | null;
  notes: string | null;
  recordingUrl: string | null;
  recommendation: Recommendation | null;
  hireProbability: string | null;
  fitDecision: EvaluationFitDecision | null;
  evaluatedAt: Date | null;
};

type EvaluationFormProps = {
  onSave: (evaluation: EvaluationFormData) => void;
  onCancel: () => void;
  applications: Application[];
  interviewers: Interviewer[];
  initialValues?: EvaluationFormData;
  isSaving?: boolean;
};

export default function EvaluationForm({
  onSave,
  onCancel,
  applications,
  interviewers,
  initialValues,
  isSaving = false,
}: EvaluationFormProps) {
  const [applicationId, setApplicationId] = useState(
    initialValues?.applicationId.toString() ?? "",
  );
  const [interviewerId, setInterviewerId] = useState(
    initialValues?.interviewerId.toString() ?? "",
  );
  const [overallScore, setOverallScore] = useState(
    initialValues?.overallScore?.toString() ?? "",
  );
  const [scorecard, setScorecard] = useState(
    scorecardToFormValue(initialValues?.scorecard ?? null),
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [recordingUrl, setRecordingUrl] = useState(
    initialValues?.recordingUrl ?? "",
  );
  const [recommendation, setRecommendation] = useState<Recommendation | "">(
    initialValues?.recommendation ?? "",
  );
  const [hireProbability, setHireProbability] = useState(
    initialValues?.hireProbability ?? "",
  );
  const [fitDecision, setFitDecision] = useState<EvaluationFitDecision | "">(
    initialValues?.fitDecision ?? "",
  );
  const [evaluatedAt, setEvaluatedAt] = useState(
    initialValues?.evaluatedAt
      ? formatDateTimeLocalValue(initialValues.evaluatedAt)
      : "",
  );

  const [applicationError, setApplicationError] = useState("");
  const [interviewerError, setInterviewerError] = useState("");
  const [overallScoreError, setOverallScoreError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) return;

    let valid = true;

    setApplicationError("");
    setInterviewerError("");
    setOverallScoreError("");

    if (!applicationId.trim()) {
      setApplicationError("Application is required.");
      valid = false;
    }

    if (!interviewerId.trim()) {
      setInterviewerError("Interviewer is required.");
      valid = false;
    }

    const normalizedOverallScore = overallScore.trim();
    const overallScoreValue = normalizedOverallScore
      ? Number(normalizedOverallScore)
      : null;

    if (
      overallScoreValue !== null &&
      (!Number.isFinite(overallScoreValue) ||
        !Number.isInteger(overallScoreValue) ||
        overallScoreValue < 0)
    ) {
      setOverallScoreError("Overall score must be a non-negative integer.");
      valid = false;
    }

    if (!valid) return;

    onSave({
      applicationId: Number(applicationId),
      interviewerId: Number(interviewerId),
      overallScore: overallScoreValue,
      scorecard: scorecard.trim() ? scorecard.trim() : null,
      notes: notes.trim() ? notes.trim() : null,
      recordingUrl: recordingUrl.trim() ? recordingUrl.trim() : null,
      recommendation: recommendation || null,
      hireProbability: hireProbability.trim() ? hireProbability.trim() : null,
      fitDecision: fitDecision || null,
      evaluatedAt: evaluatedAt ? new Date(evaluatedAt) : null,
    });
  }

  const inputClassName = `
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
    disabled:cursor-not-allowed
    disabled:bg-zinc-50
    disabled:text-zinc-500
  `;

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      <div>
        <label
          htmlFor="evaluation-application"
          className="block text-sm font-medium text-black"
        >
          Application
        </label>

        <select
          id="evaluation-application"
          value={applicationId}
          onChange={(event) => setApplicationId(event.target.value)}
          disabled={isSaving}
          className={inputClassName}
        >
          <option value="">Select Application</option>
          {applications.map((application) => (
            <option key={application.id} value={application.id}>
              {formatApplicationOptionLabel(application)}
            </option>
          ))}
        </select>

        {applicationError && (
          <p className="mt-2 text-sm text-red-600">{applicationError}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="evaluation-interviewer"
          className="block text-sm font-medium text-black"
        >
          Interviewer
        </label>

        <select
          id="evaluation-interviewer"
          value={interviewerId}
          onChange={(event) => setInterviewerId(event.target.value)}
          disabled={isSaving}
          className={inputClassName}
        >
          <option value="">Select Interviewer</option>
          {interviewers.map((interviewer) => (
            <option key={interviewer.id} value={interviewer.id}>
              {formatInterviewerOptionLabel(interviewer)}
            </option>
          ))}
        </select>

        {interviewerError && (
          <p className="mt-2 text-sm text-red-600">{interviewerError}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="evaluation-overall-score"
          className="block text-sm font-medium text-black"
        >
          Overall Score
        </label>

        <input
          id="evaluation-overall-score"
          type="number"
          min="0"
          step="1"
          value={overallScore}
          onChange={(event) => setOverallScore(event.target.value)}
          placeholder="Optional"
          disabled={isSaving}
          className={`${inputClassName} placeholder:text-zinc-400`}
        />

        {overallScoreError && (
          <p className="mt-2 text-sm text-red-600">{overallScoreError}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="evaluation-scorecard"
          className="block text-sm font-medium text-black"
        >
          Scorecard
        </label>

        <textarea
          id="evaluation-scorecard"
          value={scorecard}
          onChange={(event) => setScorecard(event.target.value)}
          placeholder="Optional skill-wise evaluation notes"
          rows={4}
          disabled={isSaving}
          className={`${inputClassName} placeholder:text-zinc-400`}
        />
      </div>

      <div>
        <label
          htmlFor="evaluation-notes"
          className="block text-sm font-medium text-black"
        >
          Expert Notes
        </label>

        <textarea
          id="evaluation-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional"
          rows={4}
          disabled={isSaving}
          className={`${inputClassName} placeholder:text-zinc-400`}
        />
      </div>

      <div>
        <label
          htmlFor="evaluation-recording-url"
          className="block text-sm font-medium text-black"
        >
          Recording URL
        </label>

        <input
          id="evaluation-recording-url"
          type="url"
          value={recordingUrl}
          onChange={(event) => setRecordingUrl(event.target.value)}
          placeholder="Optional"
          disabled={isSaving}
          className={`${inputClassName} placeholder:text-zinc-400`}
        />
      </div>

      <div>
        <label
          htmlFor="evaluation-recommendation"
          className="block text-sm font-medium text-black"
        >
          Recommendation
        </label>

        <select
          id="evaluation-recommendation"
          value={recommendation}
          onChange={(event) => {
            const nextValue = event.target.value;
            setRecommendation(isRecommendation(nextValue) ? nextValue : "");
          }}
          disabled={isSaving}
          className={inputClassName}
        >
          <option value="">Not provided</option>
          {RECOMMENDATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="evaluation-hire-probability"
          className="block text-sm font-medium text-black"
        >
          Hire Probability
        </label>

        <input
          id="evaluation-hire-probability"
          type="text"
          value={hireProbability}
          onChange={(event) => setHireProbability(event.target.value)}
          placeholder="Optional"
          disabled={isSaving}
          className={`${inputClassName} placeholder:text-zinc-400`}
        />
      </div>

      <div>
        <label
          htmlFor="evaluation-fit-decision"
          className="block text-sm font-medium text-black"
        >
          Fit Decision
        </label>

        <select
          id="evaluation-fit-decision"
          value={fitDecision}
          onChange={(event) => {
            const nextValue = event.target.value;
            setFitDecision(isFitDecision(nextValue) ? nextValue : "");
          }}
          disabled={isSaving}
          className={inputClassName}
        >
          <option value="">Not provided</option>
          {FIT_DECISION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="evaluation-evaluated-at"
          className="block text-sm font-medium text-black"
        >
          Evaluated At
        </label>

        <input
          id="evaluation-evaluated-at"
          type="datetime-local"
          value={evaluatedAt}
          onChange={(event) => setEvaluatedAt(event.target.value)}
          disabled={isSaving}
          className={inputClassName}
        />
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
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
            disabled:cursor-not-allowed
            disabled:opacity-60
          "
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={isSaving}
          className="
            rounded-lg
            bg-black
            px-5
            py-3
            font-medium
            text-white
            transition
            hover:bg-zinc-800
            disabled:cursor-not-allowed
            disabled:opacity-60
          "
        >
          {isSaving
            ? initialValues
              ? "Saving..."
              : "Creating..."
            : initialValues
              ? "Save Changes"
              : "Create Evaluation"}
        </button>
      </div>
    </form>
  );
}

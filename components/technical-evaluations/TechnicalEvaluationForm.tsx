"use client";

import { useState } from "react";
import {
  EvaluationFitDecision,
  Recommendation,
  type SourcingDatabaseSource,
} from "@prisma/client";

import { getApplicationSourceLabel } from "@/components/applications/ApplicationForm";
import {
  FIT_DECISION_OPTIONS,
  RECOMMENDATION_OPTIONS,
} from "@/components/evaluations/EvaluationForm";
import type { ScorecardEntry } from "@/lib/validation/evaluation-validation";

type ScorecardRow = {
  skill: string;
  score: string;
  comment: string;
};

export type TechnicalEvaluationFormValues = {
  overallScore: number | null;
  scorecard: ScorecardEntry[] | null;
  notes: string | null;
  recordingUrl: string | null;
  recommendation: Recommendation | null;
  hireProbability: string | null;
  fitDecision: EvaluationFitDecision | null;
  evaluatedAt: Date | null;
};

type TechnicalEvaluationFormProps = {
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
  interviewerName: string | null;
  initialValues: TechnicalEvaluationFormValues;
  isSaving?: boolean;
  errorMessage?: string;
  onSave: (values: TechnicalEvaluationFormValues) => Promise<void>;
};

function formatOptional(value: string | number | null) {
  if (value === null || value === "") {
    return "Not provided";
  }

  return value;
}

function formatDateTimeLocalValue(value: Date | null) {
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

function scorecardToRows(scorecard: ScorecardEntry[] | null): ScorecardRow[] {
  if (!scorecard || scorecard.length === 0) {
    return [{ skill: "", score: "", comment: "" }];
  }

  return scorecard.map((entry) => ({
    skill: entry.skill,
    score: String(entry.score),
    comment: entry.comment ?? "",
  }));
}

export default function TechnicalEvaluationForm({
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
  interviewerName,
  initialValues,
  isSaving = false,
  errorMessage = "",
  onSave,
}: TechnicalEvaluationFormProps) {
  const [overallScore, setOverallScore] = useState(
    initialValues.overallScore?.toString() ?? "",
  );
  const [scorecardRows, setScorecardRows] = useState<ScorecardRow[]>(
    scorecardToRows(initialValues.scorecard),
  );
  const [notes, setNotes] = useState(initialValues.notes ?? "");
  const [recordingUrl, setRecordingUrl] = useState(
    initialValues.recordingUrl ?? "",
  );
  const [recommendation, setRecommendation] = useState<Recommendation | "">(
    initialValues.recommendation ?? "",
  );
  const [hireProbability, setHireProbability] = useState(
    initialValues.hireProbability ?? "",
  );
  const [fitDecision, setFitDecision] = useState<EvaluationFitDecision | "">(
    initialValues.fitDecision ?? "",
  );
  const [evaluatedAt, setEvaluatedAt] = useState(
    formatDateTimeLocalValue(initialValues.evaluatedAt),
  );
  const [formError, setFormError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    let parsedOverallScore: number | null = null;
    if (overallScore.trim()) {
      const value = Number(overallScore);
      if (!Number.isInteger(value) || value < 0) {
        setFormError("Overall score must be a non-negative integer.");
        return;
      }
      parsedOverallScore = value;
    }

    const filledRows = scorecardRows.filter(
      (row) => row.skill.trim() || row.score.trim() || row.comment.trim(),
    );

    const scorecard: ScorecardEntry[] = [];

    for (const [index, row] of filledRows.entries()) {
      if (!row.skill.trim()) {
        setFormError(`Scorecard entry ${index + 1} requires a skill name.`);
        return;
      }

      const scoreValue = Number(row.score);
      if (!Number.isInteger(scoreValue) || scoreValue < 0) {
        setFormError(
          `Scorecard entry ${index + 1} requires a non-negative integer score.`,
        );
        return;
      }

      scorecard.push({
        skill: row.skill.trim(),
        score: scoreValue,
        comment: row.comment.trim() || null,
      });
    }

    let parsedEvaluatedAt: Date | null = null;
    if (evaluatedAt.trim()) {
      parsedEvaluatedAt = new Date(evaluatedAt);
      if (Number.isNaN(parsedEvaluatedAt.getTime())) {
        setFormError("Evaluation date and time is invalid.");
        return;
      }
    }

    await onSave({
      overallScore: parsedOverallScore,
      scorecard: scorecard.length > 0 ? scorecard : null,
      notes: notes.trim() || null,
      recordingUrl: recordingUrl.trim() || null,
      recommendation: recommendation || null,
      hireProbability: hireProbability.trim() || null,
      fitDecision: fitDecision || null,
      evaluatedAt: parsedEvaluatedAt,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {(errorMessage || formError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage || formError}
        </p>
      )}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-black">Candidate Profile</h3>
        <dl className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-black">Candidate</dt>
            <dd>{candidateName}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Current role</dt>
            <dd>{role}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Employer</dt>
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
          <div>
            <dt className="font-medium text-black">Expected CTC</dt>
            <dd>{formatOptional(expectedCTC)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-black">Skills</dt>
            <dd>{formatOptional(skills)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Requirement</dt>
            <dd>
              {jobTitle} — {companyName}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-black">Source</dt>
            <dd>{getApplicationSourceLabel(source)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-black">Interviewer</dt>
            <dd>{interviewerName || "Not assigned"}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-black">Scorecard</h3>
          <button
            type="button"
            onClick={() =>
              setScorecardRows((rows) => [
                ...rows,
                { skill: "", score: "", comment: "" },
              ])
            }
            disabled={isSaving}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-60"
          >
            Add skill
          </button>
        </div>
        <div className="space-y-3">
          {scorecardRows.map((row, index) => (
            <div
              key={`scorecard-${index}`}
              className="grid gap-3 rounded-xl border border-zinc-200 p-4 md:grid-cols-[1.2fr_0.6fr_1.4fr_auto]"
            >
              <div>
                <label className="block text-sm font-medium text-black">
                  Skill name
                </label>
                <input
                  type="text"
                  value={row.skill}
                  onChange={(event) =>
                    setScorecardRows((rows) =>
                      rows.map((current, currentIndex) =>
                        currentIndex === index
                          ? { ...current, skill: event.target.value }
                          : current,
                      ),
                    )
                  }
                  disabled={isSaving}
                  className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-black outline-none focus:border-black disabled:bg-zinc-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-black">
                  Score
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={row.score}
                  onChange={(event) =>
                    setScorecardRows((rows) =>
                      rows.map((current, currentIndex) =>
                        currentIndex === index
                          ? { ...current, score: event.target.value }
                          : current,
                      ),
                    )
                  }
                  disabled={isSaving}
                  className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-black outline-none focus:border-black disabled:bg-zinc-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-black">
                  Comment
                </label>
                <input
                  type="text"
                  value={row.comment}
                  onChange={(event) =>
                    setScorecardRows((rows) =>
                      rows.map((current, currentIndex) =>
                        currentIndex === index
                          ? { ...current, comment: event.target.value }
                          : current,
                      ),
                    )
                  }
                  disabled={isSaving}
                  className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-black outline-none focus:border-black disabled:bg-zinc-50"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() =>
                    setScorecardRows((rows) =>
                      rows.length === 1
                        ? [{ skill: "", score: "", comment: "" }]
                        : rows.filter((_, currentIndex) => currentIndex !== index),
                    )
                  }
                  disabled={isSaving}
                  className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="tech-overall-score" className="block text-sm font-medium text-black">
            Overall Score
          </label>
          <input
            id="tech-overall-score"
            type="number"
            min={0}
            step={1}
            value={overallScore}
            onChange={(event) => setOverallScore(event.target.value)}
            disabled={isSaving}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none focus:border-black disabled:bg-zinc-50"
          />
        </div>
        <div>
          <label htmlFor="tech-evaluated-at" className="block text-sm font-medium text-black">
            Evaluated at
          </label>
          <input
            id="tech-evaluated-at"
            type="datetime-local"
            value={evaluatedAt}
            onChange={(event) => setEvaluatedAt(event.target.value)}
            disabled={isSaving}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none focus:border-black disabled:bg-zinc-50"
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="tech-notes" className="block text-sm font-medium text-black">
            Expert Notes
          </label>
          <textarea
            id="tech-notes"
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={isSaving}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none focus:border-black disabled:bg-zinc-50"
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="tech-recording" className="block text-sm font-medium text-black">
            Recording URL
          </label>
          <input
            id="tech-recording"
            type="text"
            value={recordingUrl}
            onChange={(event) => setRecordingUrl(event.target.value)}
            disabled={isSaving}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none focus:border-black disabled:bg-zinc-50"
          />
        </div>
        <div>
          <label htmlFor="tech-recommendation" className="block text-sm font-medium text-black">
            Recommendation
          </label>
          <select
            id="tech-recommendation"
            value={recommendation}
            onChange={(event) =>
              setRecommendation(event.target.value as Recommendation | "")
            }
            disabled={isSaving}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none focus:border-black disabled:bg-zinc-50"
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
          <label htmlFor="tech-hire-probability" className="block text-sm font-medium text-black">
            Hire Probability
          </label>
          <input
            id="tech-hire-probability"
            type="text"
            value={hireProbability}
            onChange={(event) => setHireProbability(event.target.value)}
            disabled={isSaving}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none focus:border-black disabled:bg-zinc-50"
          />
        </div>
        <div>
          <label htmlFor="tech-fit-decision" className="block text-sm font-medium text-black">
            Final Fit Decision
          </label>
          <select
            id="tech-fit-decision"
            value={fitDecision}
            onChange={(event) =>
              setFitDecision(event.target.value as EvaluationFitDecision | "")
            }
            disabled={isSaving}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none focus:border-black disabled:bg-zinc-50"
          >
            <option value="">Not provided</option>
            {FIT_DECISION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <button
        type="submit"
        disabled={isSaving}
        className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? "Saving..." : "Save Technical Evaluation"}
      </button>
    </form>
  );
}

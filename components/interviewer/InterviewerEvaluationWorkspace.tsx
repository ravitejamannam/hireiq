"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  EvaluationFitDecision,
  Recommendation,
} from "@prisma/client";

import {
  createInterviewerEvaluationQuestion,
  deleteInterviewerEvaluationQuestion,
  saveInterviewerEvaluation,
  updateInterviewerEvaluationQuestion,
} from "@/app/actions/evaluation-actions";
import {
  FIT_DECISION_OPTIONS,
  RECOMMENDATION_OPTIONS,
} from "@/components/evaluations/EvaluationForm";
import {
  formatClientOptional,
  getClientFitDecisionLabel,
  getClientRecommendationLabel,
} from "@/components/client/client-labels";
import type { ScorecardEntry } from "@/lib/validation/evaluation-validation";

type Question = {
  id: number;
  question: string;
  answer: string | null;
  expertComment: string | null;
  score: number | null;
  difficulty: string | null;
  weight: string | null;
};

type EvaluationData = {
  id: number;
  overallScore: number | null;
  scorecard: unknown;
  notes: string | null;
  recordingUrl: string | null;
  recommendation: Recommendation | null;
  hireProbability: string | null;
  fitDecision: EvaluationFitDecision | null;
  evaluatedAt: string | null;
  questions: Question[];
};

type InterviewerEvaluationWorkspaceProps = {
  applicationId: number;
  evaluation: EvaluationData | null;
};

type ScorecardRow = {
  skill: string;
  score: string;
  comment: string;
};

function parseScorecard(scorecard: unknown): ScorecardEntry[] | null {
  if (!scorecard) return null;
  let value: unknown = scorecard;
  if (typeof scorecard === "string") {
    try {
      value = JSON.parse(scorecard);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value)) return null;

  const entries = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      if (typeof record.skill !== "string" || typeof record.score !== "number") {
        return null;
      }
      return {
        skill: record.skill,
        score: record.score,
        comment: typeof record.comment === "string" ? record.comment : null,
      };
    })
    .filter((entry): entry is ScorecardEntry => entry !== null);

  return entries.length > 0 ? entries : null;
}

function toRows(scorecard: ScorecardEntry[] | null): ScorecardRow[] {
  if (!scorecard || scorecard.length === 0) {
    return [{ skill: "", score: "", comment: "" }];
  }
  return scorecard.map((entry) => ({
    skill: entry.skill,
    score: String(entry.score),
    comment: entry.comment ?? "",
  }));
}

function formatDateTimeLocal(value: string | null) {
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
    : "Evaluation could not be saved.";
}

export default function InterviewerEvaluationWorkspace({
  applicationId,
  evaluation,
}: InterviewerEvaluationWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const initialScorecard = parseScorecard(evaluation?.scorecard ?? null);
  const [overallScore, setOverallScore] = useState(
    evaluation?.overallScore?.toString() ?? "",
  );
  const [scorecardRows, setScorecardRows] = useState(() =>
    toRows(initialScorecard),
  );
  const [notes, setNotes] = useState(evaluation?.notes ?? "");
  const [recordingUrl, setRecordingUrl] = useState(
    evaluation?.recordingUrl ?? "",
  );
  const [recommendation, setRecommendation] = useState<Recommendation | "">(
    evaluation?.recommendation ?? "",
  );
  const [hireProbability, setHireProbability] = useState(
    evaluation?.hireProbability ?? "",
  );
  const [fitDecision, setFitDecision] = useState<EvaluationFitDecision | "">(
    evaluation?.fitDecision ?? "",
  );
  const [evaluatedAt, setEvaluatedAt] = useState(
    formatDateTimeLocal(evaluation?.evaluatedAt ?? null),
  );
  const [questions, setQuestions] = useState(evaluation?.questions ?? []);
  const [newQuestion, setNewQuestion] = useState("");
  const [deleteQuestionId, setDeleteQuestionId] = useState<number | null>(null);

  const inputClassName =
    "mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-black disabled:bg-zinc-100";

  function buildFields() {
    const filledRows = scorecardRows.filter(
      (row) => row.skill.trim() && row.score.trim(),
    );
    const scorecard: ScorecardEntry[] = filledRows.map((row) => ({
      skill: row.skill.trim(),
      score: Number(row.score),
      comment: row.comment.trim() || null,
    }));

    return {
      overallScore: overallScore.trim() ? Number(overallScore) : null,
      scorecard: scorecard.length > 0 ? scorecard : null,
      notes: notes.trim() || null,
      recordingUrl: recordingUrl.trim() || null,
      recommendation: recommendation || null,
      hireProbability: hireProbability.trim() || null,
      fitDecision: fitDecision || null,
      evaluatedAt: evaluatedAt ? new Date(evaluatedAt) : null,
    };
  }

  function handleSaveEvaluation() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setBusy("save");

    startTransition(async () => {
      try {
        await saveInterviewerEvaluation(applicationId, buildFields());
        setSuccessMessage("Evaluation saved.");
        router.refresh();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setBusy(null);
      }
    });
  }

  function handleCreateQuestion() {
    if (!evaluation) {
      setErrorMessage("Save the evaluation before adding questions.");
      return;
    }

    setErrorMessage(null);
    setBusy("create-question");

    startTransition(async () => {
      try {
        await createInterviewerEvaluationQuestion(
          evaluation.id,
          newQuestion,
          {},
        );
        setNewQuestion("");
        setSuccessMessage("Question created.");
        router.refresh();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setBusy(null);
      }
    });
  }

  function handleUpdateQuestion(question: Question) {
    if (!evaluation) return;

    setErrorMessage(null);
    setBusy(`update-${question.id}`);

    startTransition(async () => {
      try {
        await updateInterviewerEvaluationQuestion(
          question.id,
          evaluation.id,
          question.question,
          {
            answer: question.answer,
            expertComment: question.expertComment,
            score: question.score,
            difficulty: question.difficulty,
            weight: question.weight,
          },
        );
        setSuccessMessage("Question updated.");
        router.refresh();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setBusy(null);
      }
    });
  }

  function handleDeleteQuestion(questionId: number) {
    setErrorMessage(null);
    setBusy(`delete-${questionId}`);

    startTransition(async () => {
      try {
        await deleteInterviewerEvaluationQuestion(questionId);
        setDeleteQuestionId(null);
        setSuccessMessage("Question deleted.");
        router.refresh();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Evaluation Workspace</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Create or update your evaluation for this candidate. Repeated saves
        update the same evaluation.
      </p>

      {errorMessage ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? (
        <div
          role="status"
          className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {successMessage}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-black" htmlFor="overall-score">
            Overall Score
          </label>
          <input
            id="overall-score"
            type="number"
            value={overallScore}
            disabled={isPending}
            onChange={(event) => setOverallScore(event.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-black" htmlFor="evaluated-at">
            Evaluated At
          </label>
          <input
            id="evaluated-at"
            type="datetime-local"
            value={evaluatedAt}
            disabled={isPending}
            onChange={(event) => setEvaluatedAt(event.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-black" htmlFor="recommendation">
            Recommendation
          </label>
          <select
            id="recommendation"
            value={recommendation}
            disabled={isPending}
            onChange={(event) =>
              setRecommendation(event.target.value as Recommendation | "")
            }
            className={inputClassName}
          >
            <option value="">Not set</option>
            {RECOMMENDATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-black" htmlFor="fit-decision">
            Fit Decision
          </label>
          <select
            id="fit-decision"
            value={fitDecision}
            disabled={isPending}
            onChange={(event) =>
              setFitDecision(event.target.value as EvaluationFitDecision | "")
            }
            className={inputClassName}
          >
            <option value="">Not set</option>
            {FIT_DECISION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-black" htmlFor="hire-probability">
            Hire Probability
          </label>
          <input
            id="hire-probability"
            value={hireProbability}
            disabled={isPending}
            onChange={(event) => setHireProbability(event.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-black" htmlFor="recording-url">
            Recording URL
          </label>
          <input
            id="recording-url"
            value={recordingUrl}
            disabled={isPending}
            onChange={(event) => setRecordingUrl(event.target.value)}
            className={inputClassName}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-black" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            value={notes}
            disabled={isPending}
            onChange={(event) => setNotes(event.target.value)}
            className={`${inputClassName} min-h-28`}
          />
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-medium text-black">Scorecard</h3>
        <div className="mt-3 space-y-3">
          {scorecardRows.map((row, index) => (
            <div
              key={`scorecard-${index}`}
              className="grid gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-3"
            >
              <input
                value={row.skill}
                disabled={isPending}
                placeholder="Skill"
                onChange={(event) => {
                  const next = [...scorecardRows];
                  next[index] = { ...row, skill: event.target.value };
                  setScorecardRows(next);
                }}
                className={inputClassName}
              />
              <input
                type="number"
                value={row.score}
                disabled={isPending}
                placeholder="Score"
                onChange={(event) => {
                  const next = [...scorecardRows];
                  next[index] = { ...row, score: event.target.value };
                  setScorecardRows(next);
                }}
                className={inputClassName}
              />
              <input
                value={row.comment}
                disabled={isPending}
                placeholder="Comment"
                onChange={(event) => {
                  const next = [...scorecardRows];
                  next[index] = { ...row, comment: event.target.value };
                  setScorecardRows(next);
                }}
                className={inputClassName}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            setScorecardRows((current) => [
              ...current,
              { skill: "", score: "", comment: "" },
            ])
          }
          className="mt-3 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-zinc-100 disabled:opacity-60"
        >
          Add scorecard row
        </button>
      </div>

      <div className="mt-6">
        <button
          type="button"
          disabled={isPending}
          onClick={handleSaveEvaluation}
          className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {busy === "save" ? "Saving..." : "Save Evaluation"}
        </button>
        {evaluation ? (
          <p className="mt-2 text-xs text-zinc-500">
            Current: {getClientRecommendationLabel(evaluation.recommendation)} ·{" "}
            {getClientFitDecisionLabel(evaluation.fitDecision)} · Overall{" "}
            {formatClientOptional(evaluation.overallScore)}
          </p>
        ) : null}
      </div>

      <div className="mt-10 border-t border-zinc-200 pt-6">
        <h3 className="text-sm font-medium text-black">Questions & Answers</h3>
        {!evaluation ? (
          <p className="mt-3 text-sm text-zinc-600">
            Save the evaluation before managing questions.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-3">
              <input
                value={newQuestion}
                disabled={isPending}
                onChange={(event) => setNewQuestion(event.target.value)}
                placeholder="New question"
                className={`${inputClassName} max-w-xl`}
              />
              <button
                type="button"
                disabled={isPending || !newQuestion.trim()}
                onClick={handleCreateQuestion}
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {busy === "create-question" ? "Creating..." : "Create Question"}
              </button>
            </div>

            {questions.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">
                No technical questions recorded.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {questions.map((question, index) => (
                  <article
                    key={question.id}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
                  >
                    <p className="text-sm font-semibold text-black">
                      Question {index + 1}
                    </p>
                    <textarea
                      value={question.question}
                      disabled={isPending}
                      onChange={(event) => {
                        const next = [...questions];
                        next[index] = {
                          ...question,
                          question: event.target.value,
                        };
                        setQuestions(next);
                      }}
                      className={`${inputClassName} min-h-20`}
                    />
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <textarea
                        value={question.answer ?? ""}
                        disabled={isPending}
                        placeholder="Candidate answer"
                        onChange={(event) => {
                          const next = [...questions];
                          next[index] = {
                            ...question,
                            answer: event.target.value,
                          };
                          setQuestions(next);
                        }}
                        className={`${inputClassName} min-h-20`}
                      />
                      <textarea
                        value={question.expertComment ?? ""}
                        disabled={isPending}
                        placeholder="Expert comment"
                        onChange={(event) => {
                          const next = [...questions];
                          next[index] = {
                            ...question,
                            expertComment: event.target.value,
                          };
                          setQuestions(next);
                        }}
                        className={`${inputClassName} min-h-20`}
                      />
                      <input
                        type="number"
                        value={question.score ?? ""}
                        disabled={isPending}
                        placeholder="Score"
                        onChange={(event) => {
                          const next = [...questions];
                          next[index] = {
                            ...question,
                            score: event.target.value
                              ? Number(event.target.value)
                              : null,
                          };
                          setQuestions(next);
                        }}
                        className={inputClassName}
                      />
                      <input
                        value={question.difficulty ?? ""}
                        disabled={isPending}
                        placeholder="Difficulty"
                        onChange={(event) => {
                          const next = [...questions];
                          next[index] = {
                            ...question,
                            difficulty: event.target.value,
                          };
                          setQuestions(next);
                        }}
                        className={inputClassName}
                      />
                      <input
                        value={question.weight ?? ""}
                        disabled={isPending}
                        placeholder="Weight"
                        onChange={(event) => {
                          const next = [...questions];
                          next[index] = {
                            ...question,
                            weight: event.target.value,
                          };
                          setQuestions(next);
                        }}
                        className={inputClassName}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleUpdateQuestion(question)}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-zinc-100 disabled:opacity-60"
                      >
                        {busy === `update-${question.id}`
                          ? "Updating..."
                          : "Update Question"}
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setDeleteQuestionId(question.id)}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        Delete Question
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {deleteQuestionId !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-black">Delete this question?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setDeleteQuestionId(null)}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleDeleteQuestion(deleteQuestionId)}
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                {busy === `delete-${deleteQuestionId}`
                  ? "Deleting..."
                  : "Delete Question"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

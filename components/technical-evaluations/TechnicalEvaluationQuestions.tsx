"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  createEvaluationQuestion,
  deleteEvaluationQuestion,
  updateEvaluationQuestion,
} from "@/app/actions/evaluation-actions";

export type TechnicalEvaluationQuestion = {
  id: number;
  question: string;
  answer: string | null;
  expertComment: string | null;
  score: number | null;
  difficulty: string | null;
  weight: string | null;
};

type TechnicalEvaluationQuestionsProps = {
  evaluationId: number;
  questions: TechnicalEvaluationQuestion[];
  onChanged?: () => Promise<void> | void;
};

type QuestionFormState = {
  question: string;
  answer: string;
  score: string;
  difficulty: string;
  weight: string;
  expertComment: string;
};

const emptyQuestionForm: QuestionFormState = {
  question: "",
  answer: "",
  score: "",
  difficulty: "",
  weight: "",
  expertComment: "",
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function formatOptional(value: string | number | null) {
  if (value === null || value === "") {
    return "Not provided";
  }

  return value;
}

function toQuestionFields(form: QuestionFormState) {
  const normalizedScore = form.score.trim();
  const scoreValue = normalizedScore ? Number(normalizedScore) : null;

  return {
    answer: form.answer.trim() ? form.answer.trim() : null,
    expertComment: form.expertComment.trim()
      ? form.expertComment.trim()
      : null,
    score: scoreValue,
    difficulty: form.difficulty.trim() ? form.difficulty.trim() : null,
    weight: form.weight.trim() ? form.weight.trim() : null,
  };
}

export default function TechnicalEvaluationQuestions({
  evaluationId,
  questions,
  onChanged,
}: TechnicalEvaluationQuestionsProps) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(
    null,
  );
  const [form, setForm] = useState<QuestionFormState>(emptyQuestionForm);
  const [questionError, setQuestionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingQuestionId, setDeletingQuestionId] = useState<number | null>(
    null,
  );

  function resetForm() {
    setForm(emptyQuestionForm);
    setIsAdding(false);
    setEditingQuestionId(null);
    setQuestionError("");
  }

  async function handleSave() {
    if (isSaving) return;

    setQuestionError("");
    setIsSaving(true);

    try {
      const fields = toQuestionFields(form);

      if (editingQuestionId) {
        await updateEvaluationQuestion(
          editingQuestionId,
          evaluationId,
          form.question,
          fields,
        );
      } else {
        await createEvaluationQuestion(evaluationId, form.question, fields);
      }

      resetForm();
      await onChanged?.();
      router.refresh();
    } catch (error) {
      setQuestionError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(questionId: number) {
    if (deletingQuestionId !== null) return;

    const confirmed = window.confirm(
      "Delete this evaluation question? This cannot be undone.",
    );

    if (!confirmed) return;

    setQuestionError("");
    setDeletingQuestionId(questionId);

    try {
      await deleteEvaluationQuestion(questionId);
      if (editingQuestionId === questionId) {
        resetForm();
      }
      await onChanged?.();
      router.refresh();
    } catch (error) {
      setQuestionError(getErrorMessage(error));
    } finally {
      setDeletingQuestionId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-black">Questions & Answers</h3>
        {!isAdding && editingQuestionId === null && (
          <button
            type="button"
            onClick={() => {
              setIsAdding(true);
              setForm(emptyQuestionForm);
              setQuestionError("");
            }}
            className="rounded-lg border border-black bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100"
          >
            Add question
          </button>
        )}
      </div>

      {questionError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {questionError}
        </p>
      )}

      {(isAdding || editingQuestionId !== null) && (
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div>
            <label className="block text-sm font-medium text-black" htmlFor="tech-q-text">
              Question
            </label>
            <textarea
              id="tech-q-text"
              rows={2}
              value={form.question}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  question: event.target.value,
                }))
              }
              disabled={isSaving}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-black outline-none focus:border-black disabled:bg-zinc-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black" htmlFor="tech-q-answer">
              Candidate answer
            </label>
            <textarea
              id="tech-q-answer"
              rows={3}
              value={form.answer}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  answer: event.target.value,
                }))
              }
              disabled={isSaving}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-black outline-none focus:border-black disabled:bg-zinc-50"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-black" htmlFor="tech-q-score">
                Score
              </label>
              <input
                id="tech-q-score"
                type="number"
                min={0}
                step={1}
                value={form.score}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    score: event.target.value,
                  }))
                }
                disabled={isSaving}
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-black outline-none focus:border-black disabled:bg-zinc-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black" htmlFor="tech-q-difficulty">
                Difficulty
              </label>
              <input
                id="tech-q-difficulty"
                type="text"
                value={form.difficulty}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    difficulty: event.target.value,
                  }))
                }
                disabled={isSaving}
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-black outline-none focus:border-black disabled:bg-zinc-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black" htmlFor="tech-q-weight">
                Weight
              </label>
              <input
                id="tech-q-weight"
                type="text"
                value={form.weight}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    weight: event.target.value,
                  }))
                }
                disabled={isSaving}
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-black outline-none focus:border-black disabled:bg-zinc-50"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-black" htmlFor="tech-q-comment">
              Expert comment
            </label>
            <textarea
              id="tech-q-comment"
              rows={2}
              value={form.expertComment}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  expertComment: event.target.value,
                }))
              }
              disabled={isSaving}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-black outline-none focus:border-black disabled:bg-zinc-50"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save question"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={isSaving}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {questions.length === 0 ? (
        <p className="text-sm text-zinc-500">No questions recorded yet.</p>
      ) : (
        <ul className="space-y-4">
          {questions.map((question, index) => (
            <li
              key={question.id}
              className="rounded-xl border border-zinc-200 bg-white p-4"
            >
              <p className="text-sm font-semibold text-black">
                Q{index + 1}. {question.question}
              </p>
              <dl className="mt-3 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="font-medium text-black">Answer</dt>
                  <dd>{formatOptional(question.answer)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Score</dt>
                  <dd>{formatOptional(question.score)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Difficulty</dt>
                  <dd>{formatOptional(question.difficulty)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Weight</dt>
                  <dd>{formatOptional(question.weight)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Expert comment</dt>
                  <dd>{formatOptional(question.expertComment)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingQuestionId(question.id);
                    setForm({
                      question: question.question,
                      answer: question.answer ?? "",
                      score:
                        question.score === null ? "" : String(question.score),
                      difficulty: question.difficulty ?? "",
                      weight: question.weight ?? "",
                      expertComment: question.expertComment ?? "",
                    });
                    setQuestionError("");
                  }}
                  disabled={isSaving || deletingQuestionId !== null}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-60"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(question.id)}
                  disabled={isSaving || deletingQuestionId !== null}
                  className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                >
                  {deletingQuestionId === question.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

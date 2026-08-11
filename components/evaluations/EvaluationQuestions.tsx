"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  createEvaluationQuestion,
  deleteEvaluationQuestion,
  updateEvaluationQuestion,
} from "@/app/actions/evaluation-actions";
import type { getEvaluations } from "@/lib/repositories/evaluation-repository";

type EvaluationQuestion = Awaited<
  ReturnType<typeof getEvaluations>
>[number]["questions"][number];

type EvaluationQuestionsProps = {
  evaluationId: number;
  questions: EvaluationQuestion[];
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

export default function EvaluationQuestions({
  evaluationId,
  questions,
}: EvaluationQuestionsProps) {
  const router = useRouter();

  const [isAdding, setIsAdding] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(
    null,
  );
  const [form, setForm] = useState<QuestionFormState>(emptyQuestionForm);
  const [questionError, setQuestionError] = useState("");
  const [actionError, setActionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingQuestionId, setDeletingQuestionId] = useState<number | null>(
    null,
  );

  function resetForm() {
    setForm(emptyQuestionForm);
    setQuestionError("");
    setIsAdding(false);
    setEditingQuestionId(null);
  }

  function startAdd() {
    setActionError("");
    setQuestionError("");
    setForm(emptyQuestionForm);
    setEditingQuestionId(null);
    setIsAdding(true);
  }

  function startEdit(question: EvaluationQuestion) {
    setActionError("");
    setQuestionError("");
    setIsAdding(false);
    setEditingQuestionId(question.id);
    setForm({
      question: question.question,
      answer: question.answer ?? "",
      score: question.score?.toString() ?? "",
      difficulty: question.difficulty ?? "",
      weight: question.weight ?? "",
      expertComment: question.expertComment ?? "",
    });
  }

  async function handleSaveQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) return;

    setQuestionError("");
    setActionError("");

    if (!form.question.trim()) {
      setQuestionError("Question is required.");
      return;
    }

    setIsSaving(true);

    try {
      const fields = toQuestionFields(form);

      if (editingQuestionId !== null) {
        await updateEvaluationQuestion(
          editingQuestionId,
          evaluationId,
          form.question.trim(),
          fields,
        );
      } else {
        await createEvaluationQuestion(
          evaluationId,
          form.question.trim(),
          fields,
        );
      }

      resetForm();
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteQuestion(id: number) {
    const confirmed = window.confirm(
      "Delete this evaluation question? This cannot be undone.",
    );

    if (!confirmed) return;

    setActionError("");
    setDeletingQuestionId(id);

    try {
      await deleteEvaluationQuestion(id);
      if (editingQuestionId === id) {
        resetForm();
      }
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setDeletingQuestionId(null);
    }
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

  const showForm = isAdding || editingQuestionId !== null;

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-black">Questions & Answers</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Capture candidate answers, scores, difficulty, weight, and expert
            comments.
          </p>
        </div>

        {!showForm && (
          <button
            type="button"
            onClick={startAdd}
            className="
              rounded-lg
              bg-black
              px-4
              py-2
              text-sm
              font-semibold
              text-white
              transition
              hover:bg-zinc-800
            "
          >
            Add Question
          </button>
        )}
      </div>

      {actionError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {showForm && (
        <form
          className="mt-6 space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-5"
          onSubmit={handleSaveQuestion}
        >
          <div>
            <label
              htmlFor="evaluation-question-text"
              className="block text-sm font-medium text-black"
            >
              Question
            </label>
            <textarea
              id="evaluation-question-text"
              value={form.question}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  question: event.target.value,
                }))
              }
              rows={3}
              disabled={isSaving}
              className={inputClassName}
            />
            {questionError && (
              <p className="mt-2 text-sm text-red-600">{questionError}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="evaluation-question-answer"
              className="block text-sm font-medium text-black"
            >
              Candidate Answer
            </label>
            <textarea
              id="evaluation-question-answer"
              value={form.answer}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  answer: event.target.value,
                }))
              }
              rows={3}
              placeholder="Optional"
              disabled={isSaving}
              className={`${inputClassName} placeholder:text-zinc-400`}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="evaluation-question-score"
                className="block text-sm font-medium text-black"
              >
                Score
              </label>
              <input
                id="evaluation-question-score"
                type="number"
                min="0"
                step="1"
                value={form.score}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    score: event.target.value,
                  }))
                }
                placeholder="Optional"
                disabled={isSaving}
                className={`${inputClassName} placeholder:text-zinc-400`}
              />
            </div>

            <div>
              <label
                htmlFor="evaluation-question-difficulty"
                className="block text-sm font-medium text-black"
              >
                Difficulty
              </label>
              <input
                id="evaluation-question-difficulty"
                type="text"
                value={form.difficulty}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    difficulty: event.target.value,
                  }))
                }
                placeholder="Optional"
                disabled={isSaving}
                className={`${inputClassName} placeholder:text-zinc-400`}
              />
            </div>

            <div>
              <label
                htmlFor="evaluation-question-weight"
                className="block text-sm font-medium text-black"
              >
                Weight
              </label>
              <input
                id="evaluation-question-weight"
                type="text"
                value={form.weight}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    weight: event.target.value,
                  }))
                }
                placeholder="Optional"
                disabled={isSaving}
                className={`${inputClassName} placeholder:text-zinc-400`}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="evaluation-question-expert-comment"
              className="block text-sm font-medium text-black"
            >
              Expert Comment
            </label>
            <textarea
              id="evaluation-question-expert-comment"
              value={form.expertComment}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  expertComment: event.target.value,
                }))
              }
              rows={3}
              placeholder="Optional"
              disabled={isSaving}
              className={`${inputClassName} placeholder:text-zinc-400`}
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={resetForm}
              disabled={isSaving}
              className="
                rounded-lg
                border
                border-zinc-300
                bg-white
                px-4
                py-2
                text-sm
                font-medium
                text-black
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
                px-4
                py-2
                text-sm
                font-semibold
                text-white
                hover:bg-zinc-800
                disabled:cursor-not-allowed
                disabled:opacity-60
              "
            >
              {isSaving
                ? editingQuestionId !== null
                  ? "Updating..."
                  : "Adding..."
                : editingQuestionId !== null
                  ? "Update Question"
                  : "Add Question"}
            </button>
          </div>
        </form>
      )}

      {questions.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-500">
          No questions yet. Add the first evaluation question.
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {questions.map((question) => (
            <li
              key={question.id}
              className="rounded-xl border border-zinc-200 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-zinc-500">Question</p>
                  <p className="mt-1 font-medium text-black">
                    {question.question}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(question)}
                    disabled={
                      isSaving || deletingQuestionId === question.id || showForm
                    }
                    className="
                      rounded-lg
                      border
                      border-zinc-300
                      px-3
                      py-1.5
                      text-sm
                      font-medium
                      text-black
                      hover:bg-zinc-100
                      disabled:cursor-not-allowed
                      disabled:opacity-60
                    "
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(question.id)}
                    disabled={isSaving || deletingQuestionId === question.id}
                    className="
                      rounded-lg
                      border
                      border-red-200
                      px-3
                      py-1.5
                      text-sm
                      font-medium
                      text-red-600
                      hover:bg-red-50
                      disabled:cursor-not-allowed
                      disabled:opacity-60
                    "
                  >
                    {deletingQuestionId === question.id
                      ? "Deleting..."
                      : "Delete"}
                  </button>
                </div>
              </div>

              <dl className="mt-4 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="font-medium text-black">Candidate Answer</dt>
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
                  <dt className="font-medium text-black">Expert Comment</dt>
                  <dd>{formatOptional(question.expertComment)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

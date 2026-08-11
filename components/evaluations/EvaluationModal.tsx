"use client";

import EvaluationForm from "@/components/evaluations/EvaluationForm";
import EvaluationQuestions from "@/components/evaluations/EvaluationQuestions";
import type { EvaluationFormData } from "@/components/evaluations/EvaluationForm";
import type { getApplications } from "@/lib/repositories/application-repository";
import type { getEvaluations } from "@/lib/repositories/evaluation-repository";
import type { getInterviewers } from "@/lib/repositories/interviewer-repository";

type Application = Awaited<ReturnType<typeof getApplications>>[number];
type Interviewer = Awaited<ReturnType<typeof getInterviewers>>[number];
type Evaluation = Awaited<ReturnType<typeof getEvaluations>>[number];

type EvaluationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (evaluation: EvaluationFormData) => void;
  applications: Application[];
  interviewers: Interviewer[];
  initialValues?: EvaluationFormData;
  editingEvaluation?: Evaluation | null;
  errorMessage?: string;
  isSaving?: boolean;
};

export default function EvaluationModal({
  isOpen,
  onClose,
  onSave,
  applications,
  interviewers,
  initialValues,
  editingEvaluation = null,
  errorMessage,
  isSaving = false,
}: EvaluationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Technical Evaluation
            </p>
            <h2 className="mt-2 text-2xl font-bold text-black">
              {initialValues ? "Edit Evaluation" : "Add Evaluation"}
            </h2>
          </div>

          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={isSaving}
            className="text-2xl text-zinc-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            ×
          </button>
        </div>

        {errorMessage && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <EvaluationForm
          key={editingEvaluation?.id ?? "create-evaluation"}
          onSave={onSave}
          onCancel={onClose}
          applications={applications}
          interviewers={interviewers}
          initialValues={initialValues}
          isSaving={isSaving}
        />

        {editingEvaluation && (
          <div className="mt-10 border-t border-zinc-200 pt-8">
            <EvaluationQuestions
              key={editingEvaluation.id}
              evaluationId={editingEvaluation.id}
              questions={editingEvaluation.questions}
            />
          </div>
        )}
      </div>
    </div>
  );
}

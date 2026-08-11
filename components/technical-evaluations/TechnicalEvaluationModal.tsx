"use client";

import type { SourcingDatabaseSource } from "@prisma/client";

import TechnicalEvaluationForm from "@/components/technical-evaluations/TechnicalEvaluationForm";
import type { TechnicalEvaluationFormValues } from "@/components/technical-evaluations/TechnicalEvaluationForm";
import TechnicalEvaluationQuestions from "@/components/technical-evaluations/TechnicalEvaluationQuestions";
import type { TechnicalEvaluationQuestion } from "@/components/technical-evaluations/TechnicalEvaluationQuestions";
import type { ScorecardEntry } from "@/lib/validation/evaluation-validation";

type TechnicalEvaluationModalProps = {
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
  interviewerName: string | null;
  evaluationId: number | null;
  questions: TechnicalEvaluationQuestion[];
  initialValues: TechnicalEvaluationFormValues;
  isSaving?: boolean;
  errorMessage?: string;
  onClose: () => void;
  onSave: (values: TechnicalEvaluationFormValues) => Promise<void>;
  onQuestionsChanged?: () => Promise<void> | void;
};

function normalizeScorecard(scorecard: unknown): ScorecardEntry[] | null {
  if (!scorecard) return null;
  if (!Array.isArray(scorecard)) return null;

  return scorecard
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      if (typeof record.skill !== "string" || typeof record.score !== "number") {
        return null;
      }
      return {
        skill: record.skill,
        score: record.score,
        comment:
          typeof record.comment === "string"
            ? record.comment
            : record.comment === null
              ? null
              : null,
      };
    })
    .filter((entry): entry is ScorecardEntry => entry !== null);
}

export default function TechnicalEvaluationModal({
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
  interviewerName,
  evaluationId,
  questions,
  initialValues,
  isSaving = false,
  errorMessage = "",
  onClose,
  onSave,
  onQuestionsChanged,
}: TechnicalEvaluationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Technical Evaluation
            </p>
            <h2 className="mt-2 text-2xl font-bold text-black">{candidateName}</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {jobTitle} — {companyName}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close technical evaluation"
            onClick={onClose}
            disabled={isSaving}
            className="text-2xl text-zinc-500 hover:text-black disabled:opacity-60"
          >
            ×
          </button>
        </div>

        <div className="mt-8 space-y-10">
          <TechnicalEvaluationForm
            key={`${candidateName}:${JSON.stringify(initialValues.scorecard)}:${initialValues.overallScore}`}
            candidateName={candidateName}
            role={role}
            currentEmployer={currentEmployer}
            location={location}
            experienceYears={experienceYears}
            skills={skills}
            expectedCTC={expectedCTC}
            source={source}
            jobTitle={jobTitle}
            companyName={companyName}
            interviewerName={interviewerName}
            initialValues={{
              ...initialValues,
              scorecard: normalizeScorecard(initialValues.scorecard),
            }}
            isSaving={isSaving}
            errorMessage={errorMessage}
            onSave={onSave}
          />

          {evaluationId ? (
            <TechnicalEvaluationQuestions
              evaluationId={evaluationId}
              questions={questions}
              onChanged={onQuestionsChanged}
            />
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Save the technical evaluation first to add questions and answers.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

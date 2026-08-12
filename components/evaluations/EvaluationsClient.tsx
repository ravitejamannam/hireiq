"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createEvaluation,
  deleteEvaluation,
  updateEvaluation,
} from "@/app/actions/evaluation-actions";
import type { EvaluationFormData } from "@/components/evaluations/EvaluationForm";
import {
  getFitDecisionLabel,
  getRecommendationLabel,
  scorecardToFormValue,
} from "@/components/evaluations/EvaluationForm";
import EvaluationCard from "@/components/evaluations/EvaluationCard";
import EvaluationModal from "@/components/evaluations/EvaluationModal";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import WorkflowRequirementNav, {
  useRequirementIdFilter,
} from "@/components/dashboard/WorkflowRequirementNav";
import type { getApplications } from "@/lib/repositories/application-repository";
import type { getEvaluations } from "@/lib/repositories/evaluation-repository";
import type { getInterviewers } from "@/lib/repositories/interviewer-repository";

type Evaluation = Awaited<ReturnType<typeof getEvaluations>>[number];
type Application = Awaited<ReturnType<typeof getApplications>>[number];
type Interviewer = Awaited<ReturnType<typeof getInterviewers>>[number];

type EvaluationsClientProps = {
  initialEvaluations: Evaluation[];
  applications: Application[];
  interviewers: Interviewer[];
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function EvaluationsClientInner({
  initialEvaluations,
  applications,
  interviewers,
}: EvaluationsClientProps) {
  const router = useRouter();
  const requirementIdFilter = useRequirementIdFilter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingEvaluationId, setDeletingEvaluationId] = useState<
    number | null
  >(null);
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [editingEvaluation, setEditingEvaluation] =
    useState<Evaluation | null>(null);

  const requirementOptions = Array.from(
    new Map(
      applications.map((application) => [
        application.jobId,
        {
          id: application.jobId,
          title: application.job.title,
        },
      ]),
    ).values(),
  );

  function openCreateModal() {
    setEditingEvaluation(null);
    setActionError("");
    setIsModalOpen(true);
  }

  function handleEditEvaluation(id: number) {
    const evaluation = initialEvaluations.find(
      (evaluation) => evaluation.id === id,
    );

    if (!evaluation) return;

    setActionError("");
    setEditingEvaluation(evaluation);
    setIsModalOpen(true);
  }

  async function handleSaveEvaluation(evaluation: EvaluationFormData) {
    if (isSaving) return;

    setIsSaving(true);
    setActionError("");

    try {
      const fields = {
        overallScore: evaluation.overallScore,
        scorecard: evaluation.scorecard,
        notes: evaluation.notes,
        recordingUrl: evaluation.recordingUrl,
        recommendation: evaluation.recommendation,
        hireProbability: evaluation.hireProbability,
        fitDecision: evaluation.fitDecision,
        evaluatedAt: evaluation.evaluatedAt,
      };

      if (editingEvaluation) {
        await updateEvaluation(
          editingEvaluation.id,
          evaluation.applicationId,
          evaluation.interviewerId,
          fields,
        );
      } else {
        await createEvaluation(
          evaluation.applicationId,
          evaluation.interviewerId,
          fields,
        );
      }

      setEditingEvaluation(null);
      setIsModalOpen(false);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteEvaluation(id: number) {
    const confirmed = window.confirm(
      "Delete this evaluation? This cannot be undone.",
    );

    if (!confirmed) return;

    setActionError("");
    setDeletingEvaluationId(id);

    try {
      await deleteEvaluation(id);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setDeletingEvaluationId(null);
    }
  }

  const filteredEvaluations = initialEvaluations.filter((evaluation) => {
    if (
      requirementIdFilter !== null &&
      evaluation.application.jobId !== requirementIdFilter
    ) {
      return false;
    }

    const query = search.trim().toLowerCase();

    if (!query) return true;

    const searchableValues = [
      evaluation.application.candidate.name,
      evaluation.application.candidate.role,
      evaluation.application.candidate.currentEmployer,
      evaluation.application.job.title,
      evaluation.application.job.company.name,
      evaluation.interviewer.name,
      evaluation.recommendation,
      getRecommendationLabel(evaluation.recommendation),
      evaluation.fitDecision,
      getFitDecisionLabel(evaluation.fitDecision),
    ];

    return searchableValues.some((value) =>
      (value ?? "").toLowerCase().includes(query),
    );
  });

  return (
    <DashboardLayout>
      <WorkflowRequirementNav requirements={requirementOptions} />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">Evaluations</h1>
          <p className="mt-2 text-zinc-600">
            Manage technical evaluations, scorecards, and expert questions.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="
            rounded-lg
            bg-black
            px-5
            py-3
            text-sm
            font-semibold
            text-white
            transition
            hover:bg-zinc-800
          "
        >
          + Add Evaluation
        </button>
      </div>

      <div className="mt-8">
        <label htmlFor="evaluations-search" className="sr-only">
          Search evaluations
        </label>
        <input
          id="evaluations-search"
          type="text"
          placeholder="Search by candidate, role, employer, job, company, interviewer, recommendation, or fit..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="
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
            placeholder:text-zinc-400
            focus:border-black
          "
        />
      </div>

      {actionError && !isModalOpen && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {filteredEvaluations.length === 0 ? (
        <div className="mt-10">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20">
            <p className="text-lg font-medium text-black">
              {initialEvaluations.length === 0
                ? "No evaluations yet"
                : "No matching evaluations"}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              {initialEvaluations.length === 0
                ? "Create an evaluation to capture expert technical feedback."
                : "Try a different search term."}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredEvaluations.map((evaluation) => (
            <EvaluationCard
              key={evaluation.id}
              id={evaluation.id}
              candidateName={evaluation.application.candidate.name}
              candidateRole={evaluation.application.candidate.role}
              currentEmployer={evaluation.application.candidate.currentEmployer}
              jobTitle={evaluation.application.job.title}
              companyName={evaluation.application.job.company.name}
              interviewerName={evaluation.interviewer.name}
              overallScore={evaluation.overallScore}
              recommendation={evaluation.recommendation}
              hireProbability={evaluation.hireProbability}
              fitDecision={evaluation.fitDecision}
              evaluatedAt={evaluation.evaluatedAt}
              isDeleting={deletingEvaluationId === evaluation.id}
              onEdit={handleEditEvaluation}
              onDelete={handleDeleteEvaluation}
            />
          ))}
        </div>
      )}

      <EvaluationModal
        isOpen={isModalOpen}
        onClose={() => {
          if (isSaving) return;
          setIsModalOpen(false);
          setEditingEvaluation(null);
          setActionError("");
        }}
        onSave={handleSaveEvaluation}
        applications={applications}
        interviewers={interviewers}
        editingEvaluation={editingEvaluation}
        errorMessage={actionError}
        isSaving={isSaving}
        initialValues={
          editingEvaluation
            ? {
                applicationId: editingEvaluation.applicationId,
                interviewerId: editingEvaluation.interviewerId,
                overallScore: editingEvaluation.overallScore,
                scorecard: scorecardToFormValue(editingEvaluation.scorecard),
                notes: editingEvaluation.notes,
                recordingUrl: editingEvaluation.recordingUrl,
                recommendation: editingEvaluation.recommendation,
                hireProbability: editingEvaluation.hireProbability,
                fitDecision: editingEvaluation.fitDecision,
                evaluatedAt: editingEvaluation.evaluatedAt,
              }
            : undefined
        }
      />
    </DashboardLayout>
  );
}

export default function EvaluationsClient(props: EvaluationsClientProps) {
  return (
    <Suspense fallback={null}>
      <EvaluationsClientInner {...props} />
    </Suspense>
  );
}

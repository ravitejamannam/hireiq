"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApplicationPipelineStatus } from "@prisma/client";

import { transitionApplicationStatus } from "@/app/actions/application-actions";
import {
  getTechnicalEvaluationForApplication,
  saveTechnicalEvaluation,
} from "@/app/actions/evaluation-actions";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import TechnicalEvaluationCard from "@/components/technical-evaluations/TechnicalEvaluationCard";
import type { TechnicalEvaluationState } from "@/components/technical-evaluations/TechnicalEvaluationCard";
import TechnicalEvaluationModal from "@/components/technical-evaluations/TechnicalEvaluationModal";
import type { TechnicalEvaluationFormValues } from "@/components/technical-evaluations/TechnicalEvaluationForm";
import type { getTechnicalEvaluationApplications } from "@/lib/repositories/application-repository";
import type { ScorecardEntry } from "@/lib/validation/evaluation-validation";

type Application = Awaited<
  ReturnType<typeof getTechnicalEvaluationApplications>
>[number];

type EvaluationDetail = NonNullable<
  Awaited<ReturnType<typeof getTechnicalEvaluationForApplication>>
>;

type StatusFilter = "ALL" | "EXPERT_REVIEW" | "TECH_EVALUATION";

type TechnicalEvaluationsClientProps = {
  initialApplications: Application[];
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function getAssignedEvaluationSummary(application: Application) {
  const interviewerId = application.job.assignedInterviewerId;
  if (!interviewerId) return null;

  return (
    application.evaluations.find(
      (evaluation) => evaluation.interviewerId === interviewerId,
    ) ?? null
  );
}

function getEvaluationState(
  evaluation: { evaluatedAt: Date | null } | null,
): TechnicalEvaluationState {
  if (!evaluation) return "NOT_EVALUATED";
  if (evaluation.evaluatedAt) return "COMPLETED";
  return "IN_PROGRESS";
}

function normalizeScorecard(scorecard: unknown): ScorecardEntry[] | null {
  if (!scorecard || !Array.isArray(scorecard)) return null;

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
        comment: typeof record.comment === "string" ? record.comment : null,
      };
    })
    .filter((entry): entry is ScorecardEntry => entry !== null);
}

export default function TechnicalEvaluationsClient({
  initialApplications,
}: TechnicalEvaluationsClientProps) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("TECH_EVALUATION");
  const [actionError, setActionError] = useState("");
  const [movingApplicationId, setMovingApplicationId] = useState<number | null>(
    null,
  );
  const [selectedApplicationId, setSelectedApplicationId] = useState<
    number | null
  >(null);
  const [selectedEvaluation, setSelectedEvaluation] =
    useState<EvaluationDetail | null>(null);
  const [isLoadingEvaluation, setIsLoadingEvaluation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  const selectedApplication = useMemo(
    () =>
      initialApplications.find(
        (application) => application.id === selectedApplicationId,
      ) ?? null,
    [initialApplications, selectedApplicationId],
  );

  async function openTechnicalEvaluation(applicationId: number) {
    const application = initialApplications.find(
      (item) => item.id === applicationId,
    );

    if (!application) return;

    setModalError("");
    setSelectedApplicationId(applicationId);
    setSelectedEvaluation(null);

    if (!application.job.assignedInterviewerId) {
      setModalError("Interviewer must be assigned before technical evaluation.");
      return;
    }

    setIsLoadingEvaluation(true);

    try {
      const evaluation = await getTechnicalEvaluationForApplication(
        application.id,
      );
      setSelectedEvaluation(evaluation);
    } catch (error) {
      setModalError(getErrorMessage(error));
      setSelectedEvaluation(null);
    } finally {
      setIsLoadingEvaluation(false);
    }
  }

  function closeTechnicalEvaluation() {
    if (isSaving) return;
    setSelectedApplicationId(null);
    setSelectedEvaluation(null);
    setModalError("");
  }

  const filteredApplications = initialApplications.filter((application) => {
    if (statusFilter !== "ALL" && application.status !== statusFilter) {
      return false;
    }

    const query = search.trim().toLowerCase();
    if (!query) return true;

    const searchableValues = [
      application.candidate.name,
      application.candidate.role,
      application.candidate.currentEmployer,
      application.candidate.location,
      application.candidate.skills,
      application.job.title,
      application.job.company.name,
      application.job.assignedInterviewer?.name,
    ];

    return searchableValues.some(
      (value) => value?.toLowerCase().includes(query) ?? false,
    );
  });

  async function handleTransition(
    id: number,
    nextStatus: ApplicationPipelineStatus,
  ) {
    setActionError("");
    setMovingApplicationId(id);

    try {
      await transitionApplicationStatus(id, nextStatus);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setMovingApplicationId(null);
    }
  }

  async function handleSave(values: TechnicalEvaluationFormValues) {
    if (!selectedApplication) return;

    setModalError("");
    setIsSaving(true);

    try {
      await saveTechnicalEvaluation(selectedApplication.id, values);
      const refreshed = await getTechnicalEvaluationForApplication(
        selectedApplication.id,
      );
      setSelectedEvaluation(refreshed);
      router.refresh();
    } catch (error) {
      setModalError(getErrorMessage(error));
      throw error;
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-3xl font-bold text-black">Technical Evaluations</h1>
        <p className="mt-2 text-zinc-600">
          Record technical scorecards, questions, and fit decisions for
          interviewed candidates.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-end">
        <div className="flex-1">
          <label
            htmlFor="tech-eval-search"
            className="block text-sm font-medium text-black"
          >
            Search
          </label>
          <input
            id="tech-eval-search"
            type="text"
            placeholder="Search by candidate, role, employer, location, skills, job, company, or interviewer..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
          />
        </div>
        <div>
          <label
            htmlFor="tech-eval-status"
            className="block text-sm font-medium text-black"
          >
            Status
          </label>
          <select
            id="tech-eval-status"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black md:min-w-52"
          >
            <option value="ALL">All</option>
            <option value="EXPERT_REVIEW">Expert Review</option>
            <option value="TECH_EVALUATION">Tech Evaluation</option>
          </select>
        </div>
      </div>

      {actionError && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {filteredApplications.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 bg-white py-20 text-center">
          <p className="text-lg font-medium text-black">
            {initialApplications.length === 0
              ? "No technical evaluation candidates"
              : "No matching candidates"}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {initialApplications.length === 0
              ? "Move profiles from Expert Review into Technical Evaluation to begin."
              : "Try a different search or status filter."}
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredApplications.map((application) => {
            const summary = getAssignedEvaluationSummary(application);

            return (
              <TechnicalEvaluationCard
                key={application.id}
                id={application.id}
                status={application.status}
                candidateName={application.candidate.name}
                role={application.candidate.role}
                currentEmployer={application.candidate.currentEmployer}
                location={application.candidate.location}
                experienceYears={application.candidate.experienceYears}
                skills={application.candidate.skills}
                expectedCTC={application.candidate.expectedCTC}
                source={application.source}
                expertScore={application.expertScore}
                overallScore={summary?.overallScore ?? null}
                recommendation={summary?.recommendation ?? null}
                hireProbability={summary?.hireProbability ?? null}
                fitDecision={summary?.fitDecision ?? null}
                jobTitle={application.job.title}
                companyName={application.job.company.name}
                interviewerName={
                  application.job.assignedInterviewer?.name ?? null
                }
                evaluationState={getEvaluationState(summary)}
                isMoving={movingApplicationId === application.id}
                onStartTechEvaluation={(id) =>
                  handleTransition(id, ApplicationPipelineStatus.TECH_EVALUATION)
                }
                onOpenEvaluation={(id) => {
                  void openTechnicalEvaluation(id);
                }}
                onMoveToShortlisted={(id) =>
                  handleTransition(id, ApplicationPipelineStatus.SHORTLISTED)
                }
                onReject={(id) =>
                  handleTransition(id, ApplicationPipelineStatus.REJECTED)
                }
              />
            );
          })}
        </div>
      )}

      {selectedApplication && (
        <TechnicalEvaluationModal
          isOpen
          candidateName={selectedApplication.candidate.name}
          role={selectedApplication.candidate.role}
          currentEmployer={selectedApplication.candidate.currentEmployer}
          location={selectedApplication.candidate.location}
          experienceYears={selectedApplication.candidate.experienceYears}
          skills={selectedApplication.candidate.skills}
          expectedCTC={selectedApplication.candidate.expectedCTC}
          source={selectedApplication.source}
          jobTitle={selectedApplication.job.title}
          companyName={selectedApplication.job.company.name}
          interviewerName={
            selectedApplication.job.assignedInterviewer?.name ?? null
          }
          evaluationId={selectedEvaluation?.id ?? null}
          questions={selectedEvaluation?.questions ?? []}
          initialValues={{
            overallScore: selectedEvaluation?.overallScore ?? null,
            scorecard: normalizeScorecard(selectedEvaluation?.scorecard),
            notes: selectedEvaluation?.notes ?? null,
            recordingUrl: selectedEvaluation?.recordingUrl ?? null,
            recommendation: selectedEvaluation?.recommendation ?? null,
            hireProbability: selectedEvaluation?.hireProbability ?? null,
            fitDecision: selectedEvaluation?.fitDecision ?? null,
            evaluatedAt: selectedEvaluation?.evaluatedAt ?? null,
          }}
          isSaving={isSaving || isLoadingEvaluation}
          errorMessage={modalError}
          onClose={closeTechnicalEvaluation}
          onSave={handleSave}
          onQuestionsChanged={async () => {
            if (!selectedApplication) return;
            const refreshed = await getTechnicalEvaluationForApplication(
              selectedApplication.id,
            );
            setSelectedEvaluation(refreshed);
          }}
        />
      )}
    </DashboardLayout>
  );
}

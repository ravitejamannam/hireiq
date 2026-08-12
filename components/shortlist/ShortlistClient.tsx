"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApplicationPipelineStatus } from "@prisma/client";

import { transitionApplicationStatus } from "@/app/actions/application-actions";
import { getTechnicalEvaluationForApplication } from "@/app/actions/evaluation-actions";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import WorkflowRequirementNav, {
  useRequirementIdFilter,
} from "@/components/dashboard/WorkflowRequirementNav";
import {
  getFitDecisionLabel,
  getRecommendationLabel,
} from "@/components/evaluations/EvaluationForm";
import { getApplicationSourceLabel } from "@/components/applications/ApplicationForm";
import ShortlistCard from "@/components/shortlist/ShortlistCard";
import ShortlistDetailsModal from "@/components/shortlist/ShortlistDetailsModal";
import type { getShortlistApplications } from "@/lib/repositories/application-repository";

type Application = Awaited<ReturnType<typeof getShortlistApplications>>[number];

type EvaluationDetail = NonNullable<
  Awaited<ReturnType<typeof getTechnicalEvaluationForApplication>>
>;

type StatusFilter = "ALL" | "TECH_EVALUATION" | "SHORTLISTED";

type ShortlistClientProps = {
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

function ShortlistClientInner({
  initialApplications,
}: ShortlistClientProps) {
  const router = useRouter();
  const requirementIdFilter = useRequirementIdFilter();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("SHORTLISTED");
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
  const [modalError, setModalError] = useState("");

  const requirementOptions = Array.from(
    new Map(
      initialApplications.map((application) => [
        application.jobId,
        {
          id: application.jobId,
          title: application.job.title,
        },
      ]),
    ).values(),
  );

  const selectedApplication = useMemo(
    () =>
      initialApplications.find(
        (application) => application.id === selectedApplicationId,
      ) ?? null,
    [initialApplications, selectedApplicationId],
  );

  const techEvaluationCount = initialApplications.filter(
    (application) =>
      application.status === ApplicationPipelineStatus.TECH_EVALUATION,
  ).length;
  const shortlistedCount = initialApplications.filter(
    (application) =>
      application.status === ApplicationPipelineStatus.SHORTLISTED,
  ).length;

  const filteredApplications = initialApplications.filter((application) => {
    if (
      requirementIdFilter !== null &&
      application.jobId !== requirementIdFilter
    ) {
      return false;
    }

    if (statusFilter !== "ALL" && application.status !== statusFilter) {
      return false;
    }

    const query = search.trim().toLowerCase();
    if (!query) return true;

    const summary = getAssignedEvaluationSummary(application);

    const searchableValues = [
      application.candidate.name,
      application.candidate.role,
      application.candidate.currentEmployer,
      application.candidate.location,
      application.candidate.skills,
      application.job.title,
      application.job.company.name,
      getApplicationSourceLabel(application.source),
      application.job.assignedInterviewer?.name,
      summary?.recommendation,
      getRecommendationLabel(summary?.recommendation ?? null),
      summary?.fitDecision,
      getFitDecisionLabel(summary?.fitDecision ?? null),
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

  async function handleReject(id: number) {
    const confirmed = window.confirm(
      "Reject this candidate from the shortlist workflow? This cannot be undone from Shortlist.",
    );

    if (!confirmed) return;

    await handleTransition(id, ApplicationPipelineStatus.REJECTED);
  }

  async function openDetails(applicationId: number) {
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

  function closeDetails() {
    setSelectedApplicationId(null);
    setSelectedEvaluation(null);
    setModalError("");
  }

  const selectedSummary = selectedApplication
    ? getAssignedEvaluationSummary(selectedApplication)
    : null;

  return (
    <DashboardLayout>
      <WorkflowRequirementNav requirements={requirementOptions} />
      <div>
        <h1 className="text-3xl font-bold text-black">Shortlist</h1>
        <p className="mt-2 text-zinc-600">
          Review shortlisted candidates and move strong profiles to Selected.
        </p>
        <p className="mt-3 text-sm text-zinc-500">
          Shortlisted: {shortlistedCount} · Tech Evaluation:{" "}
          {techEvaluationCount}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-end">
        <div className="flex-1">
          <label
            htmlFor="shortlist-search"
            className="block text-sm font-medium text-black"
          >
            Search
          </label>
          <input
            id="shortlist-search"
            type="text"
            placeholder="Search by candidate, role, employer, location, skills, job, company, source, interviewer, recommendation, or fit..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
          />
        </div>
        <div>
          <label
            htmlFor="shortlist-status"
            className="block text-sm font-medium text-black"
          >
            Status
          </label>
          <select
            id="shortlist-status"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black md:min-w-52"
          >
            <option value="ALL">All</option>
            <option value="TECH_EVALUATION">Tech Evaluation</option>
            <option value="SHORTLISTED">Shortlisted</option>
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
              ? "No shortlist candidates"
              : "No matching candidates"}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {initialApplications.length === 0
              ? "Move profiles from Technical Evaluation into Shortlisted to begin."
              : "Try a different search or status filter."}
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredApplications.map((application) => {
            const summary = getAssignedEvaluationSummary(application);

            return (
              <ShortlistCard
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
                hasEvaluation={Boolean(summary)}
                jobTitle={application.job.title}
                companyName={application.job.company.name}
                interviewerName={
                  application.job.assignedInterviewer?.name ?? null
                }
                shortlistingCompletedAt={
                  application.job.shortlistingCompletedAt
                }
                isMoving={movingApplicationId === application.id}
                onMoveToShortlist={(id) =>
                  handleTransition(id, ApplicationPipelineStatus.SHORTLISTED)
                }
                onMoveToSelected={(id) =>
                  handleTransition(id, ApplicationPipelineStatus.SELECTED)
                }
                onReject={handleReject}
                onViewDetails={(id) => {
                  void openDetails(id);
                }}
              />
            );
          })}
        </div>
      )}

      {selectedApplication && (
        <ShortlistDetailsModal
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
          expertScore={selectedApplication.expertScore}
          overallScore={
            selectedEvaluation?.overallScore ??
            selectedSummary?.overallScore ??
            null
          }
          recommendation={
            selectedEvaluation?.recommendation ??
            selectedSummary?.recommendation ??
            null
          }
          hireProbability={
            selectedEvaluation?.hireProbability ??
            selectedSummary?.hireProbability ??
            null
          }
          fitDecision={
            selectedEvaluation?.fitDecision ??
            selectedSummary?.fitDecision ??
            null
          }
          notes={
            selectedEvaluation?.notes ?? selectedSummary?.notes ?? null
          }
          recordingUrl={
            selectedEvaluation?.recordingUrl ??
            selectedSummary?.recordingUrl ??
            null
          }
          hasEvaluation={Boolean(selectedEvaluation || selectedSummary)}
          isLoadingEvaluation={isLoadingEvaluation}
          questions={selectedEvaluation?.questions ?? []}
          shortlistingCompletedAt={
            selectedApplication.job.shortlistingCompletedAt
          }
          errorMessage={modalError}
          onClose={closeDetails}
        />
      )}
    </DashboardLayout>
  );
}

export default function ShortlistClient(props: ShortlistClientProps) {
  return (
    <Suspense fallback={null}>
      <ShortlistClientInner {...props} />
    </Suspense>
  );
}

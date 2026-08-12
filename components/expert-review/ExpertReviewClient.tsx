"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApplicationPipelineStatus } from "@prisma/client";

import {
  saveExpertReview,
  transitionApplicationStatus,
} from "@/app/actions/application-actions";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import WorkflowRequirementNav, {
  useRequirementIdFilter,
} from "@/components/dashboard/WorkflowRequirementNav";
import ExpertReviewCard from "@/components/expert-review/ExpertReviewCard";
import ExpertReviewModal from "@/components/expert-review/ExpertReviewModal";
import type { getExpertReviewApplications } from "@/lib/repositories/application-repository";

type Application = Awaited<
  ReturnType<typeof getExpertReviewApplications>
>[number];

type StatusFilter = "ALL" | "CV_POOL" | "EXPERT_REVIEW";

type ExpertReviewClientProps = {
  initialApplications: Application[];
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function getAssignedInterviewerEvaluation(
  application: Application,
) {
  const interviewerId = application.job.assignedInterviewerId;

  if (!interviewerId) {
    return application.evaluations[0] ?? null;
  }

  return (
    application.evaluations.find(
      (evaluation) => evaluation.interviewerId === interviewerId,
    ) ?? null
  );
}

function ExpertReviewClientInner({
  initialApplications,
}: ExpertReviewClientProps) {
  const router = useRouter();
  const requirementIdFilter = useRequirementIdFilter();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [actionError, setActionError] = useState("");
  const [movingApplicationId, setMovingApplicationId] = useState<number | null>(
    null,
  );
  const [reviewingApplicationId, setReviewingApplicationId] = useState<
    number | null
  >(null);
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [reviewError, setReviewError] = useState("");

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

  const reviewingApplication = useMemo(
    () =>
      initialApplications.find(
        (application) => application.id === reviewingApplicationId,
      ) ?? null,
    [initialApplications, reviewingApplicationId],
  );

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

    const searchableValues = [
      application.candidate.name,
      application.candidate.role,
      application.candidate.currentEmployer,
      application.candidate.location,
      application.candidate.skills,
      application.job.title,
      application.job.company.name,
    ];

    return searchableValues.some(
      (value) => value?.toLowerCase().includes(query) ?? false,
    );
  });

  async function handleStartReview(id: number) {
    setActionError("");
    setMovingApplicationId(id);

    try {
      await transitionApplicationStatus(
        id,
        ApplicationPipelineStatus.EXPERT_REVIEW,
      );
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setMovingApplicationId(null);
    }
  }

  async function handleMoveToTechEvaluation(id: number) {
    setActionError("");
    setMovingApplicationId(id);

    try {
      await transitionApplicationStatus(
        id,
        ApplicationPipelineStatus.TECH_EVALUATION,
      );
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setMovingApplicationId(null);
    }
  }

  async function handleSaveReview(
    expertScore: number | null,
    notes: string | null,
  ) {
    if (!reviewingApplication) return;

    setReviewError("");
    setIsSavingReview(true);

    try {
      await saveExpertReview(reviewingApplication.id, expertScore, notes);
      setReviewingApplicationId(null);
      router.refresh();
    } catch (error) {
      setReviewError(getErrorMessage(error));
      throw error;
    } finally {
      setIsSavingReview(false);
    }
  }

  const assignedEvaluation = reviewingApplication
    ? getAssignedInterviewerEvaluation(reviewingApplication)
    : null;

  return (
    <DashboardLayout>
      <WorkflowRequirementNav requirements={requirementOptions} />
      <div>
        <h1 className="text-3xl font-bold text-black">Expert Review</h1>
        <p className="mt-2 text-zinc-600">
          Move CV Pool profiles into expert review and record interviewer
          assessments.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-end">
        <div className="flex-1">
          <label
            htmlFor="expert-review-search"
            className="block text-sm font-medium text-black"
          >
            Search
          </label>
          <input
            id="expert-review-search"
            type="text"
            placeholder="Search by candidate, role, employer, location, skills, job, or company..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
          />
        </div>
        <div>
          <label
            htmlFor="expert-review-status"
            className="block text-sm font-medium text-black"
          >
            Status
          </label>
          <select
            id="expert-review-status"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black md:min-w-48"
          >
            <option value="ALL">All</option>
            <option value="CV_POOL">CV Pool</option>
            <option value="EXPERT_REVIEW">Expert Review</option>
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
              ? "No profiles ready for expert review"
              : "No matching profiles"}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {initialApplications.length === 0
              ? "Source profiles into the CV Pool, then start expert review here."
              : "Try a different search or status filter."}
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredApplications.map((application) => {
            const evaluation = getAssignedInterviewerEvaluation(application);

            return (
              <ExpertReviewCard
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
                jobTitle={application.job.title}
                companyName={application.job.company.name}
                hasEvaluation={Boolean(evaluation)}
                evaluationId={evaluation?.id ?? null}
                isMoving={movingApplicationId === application.id}
                onStartReview={handleStartReview}
                onOpenReview={(id) => {
                  setReviewError("");
                  setReviewingApplicationId(id);
                }}
                onMoveToTechEvaluation={handleMoveToTechEvaluation}
              />
            );
          })}
        </div>
      )}

      {reviewingApplication && (
        <ExpertReviewModal
          key={`${reviewingApplication.id}:${reviewingApplication.expertScore}:${assignedEvaluation?.notes ?? ""}`}
          isOpen
          candidateName={reviewingApplication.candidate.name}
          role={reviewingApplication.candidate.role}
          currentEmployer={reviewingApplication.candidate.currentEmployer}
          location={reviewingApplication.candidate.location}
          experienceYears={reviewingApplication.candidate.experienceYears}
          skills={reviewingApplication.candidate.skills}
          expectedCTC={reviewingApplication.candidate.expectedCTC}
          source={reviewingApplication.source}
          jobTitle={reviewingApplication.job.title}
          companyName={reviewingApplication.job.company.name}
          assignedInterviewerName={
            reviewingApplication.job.assignedInterviewer?.name ?? null
          }
          initialExpertScore={reviewingApplication.expertScore}
          initialNotes={assignedEvaluation?.notes ?? null}
          hasEvaluation={Boolean(assignedEvaluation)}
          isSaving={isSavingReview}
          errorMessage={reviewError}
          onClose={() => {
            if (isSavingReview) return;
            setReviewingApplicationId(null);
            setReviewError("");
          }}
          onSave={handleSaveReview}
        />
      )}
    </DashboardLayout>
  );
}

export default function ExpertReviewClient(props: ExpertReviewClientProps) {
  return (
    <Suspense fallback={null}>
      <ExpertReviewClientInner {...props} />
    </Suspense>
  );
}

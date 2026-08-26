"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { ApplicationPipelineStatus } from "@prisma/client";

import {
  transitionApplicationStatus,
} from "@/app/actions/application-actions";
import { getAdminHiringMonitorNote } from "@/components/applications/admin-hiring-notes";
import {
  APPLICATION_PIPELINE_STATUS_OPTIONS,
  getApplicationPipelineStatusLabel,
  getApplicationSourceLabel,
} from "@/components/applications/ApplicationForm";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import WorkflowRequirementNav, {
  useRequirementIdFilter,
} from "@/components/dashboard/WorkflowRequirementNav";
import PipelineCard from "@/components/pipeline/PipelineCard";
import BulkActionsBar from "@/components/requirements/BulkActionsBar";
import type { getApplications } from "@/lib/repositories/application-repository";
import { ADMIN_PIPELINE_TRANSITIONS } from "@/lib/validation/application-pipeline";

type Application = Awaited<ReturnType<typeof getApplications>>[number];
type StatusFilter = "ALL" | ApplicationPipelineStatus;

type PipelineClientProps = {
  initialApplications: Application[];
};

const PIPELINE_COLUMNS: ApplicationPipelineStatus[] = [
  ApplicationPipelineStatus.CV_POOL,
  ApplicationPipelineStatus.EXPERT_REVIEW,
  ApplicationPipelineStatus.TECH_EVALUATION,
  ApplicationPipelineStatus.SHORTLISTED,
  ApplicationPipelineStatus.SELECTED,
  ApplicationPipelineStatus.HIRED,
  ApplicationPipelineStatus.REJECTED,
];

const APPLICATION_STATUS_TRANSITIONS = ADMIN_PIPELINE_TRANSITIONS;

function getValidApplicationStatusTransitions(
  currentStatus: ApplicationPipelineStatus,
) {
  return APPLICATION_STATUS_TRANSITIONS[currentStatus] ?? [];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function getMonitorNote(status: ApplicationPipelineStatus) {
  return getAdminHiringMonitorNote(status);
}

function getMoveLabel(status: ApplicationPipelineStatus) {
  if (status === ApplicationPipelineStatus.REJECTED) {
    return "Reject";
  }

  return `Move to ${getApplicationPipelineStatusLabel(status)}`;
}

function PipelineClientInner({
  initialApplications,
}: PipelineClientProps) {
  const router = useRouter();
  const requirementIdFilter = useRequirementIdFilter();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [actionError, setActionError] = useState("");
  const [movingApplicationId, setMovingApplicationId] = useState<number | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  function toggleSelected(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  }


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

  async function handleMove(
    id: number,
    nextStatus: ApplicationPipelineStatus,
  ) {
    if (movingApplicationId !== null) return;

    // T121: rejection requires a reason
    let rejectionReason: string | undefined;
    if (nextStatus === ApplicationPipelineStatus.REJECTED) {
      const reason = window.prompt(
        "Rejection reason (required — shared with compliance reporting):",
      );
      if (!reason || !reason.trim()) {
        return;
      }
      rejectionReason = reason.trim();
    }

    setActionError("");
    setMovingApplicationId(id);

    try {
      await transitionApplicationStatus(id, nextStatus, rejectionReason);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setMovingApplicationId(null);
    }
  }

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
      application.source,
      getApplicationSourceLabel(application.source),
      application.status,
      getApplicationPipelineStatusLabel(application.status),
    ];

    return searchableValues.some((value) =>
      (value ?? "").toLowerCase().includes(query),
    );
  });

  const applicationsByStatus = PIPELINE_COLUMNS.reduce(
    (grouped, status) => {
      grouped[status] = filteredApplications.filter(
        (application) => application.status === status,
      );
      return grouped;
    },
    {} as Record<ApplicationPipelineStatus, Application[]>,
  );

  const visibleColumns =
    statusFilter === "ALL"
      ? PIPELINE_COLUMNS
      : PIPELINE_COLUMNS.filter((status) => status === statusFilter);

  return (
    <DashboardLayout>
      <WorkflowRequirementNav requirements={requirementOptions} />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">Pipeline</h1>
          <p className="mt-2 text-zinc-600">
            Move applications through CV Pool, Expert Review, Tech Evaluation,
            and Shortlisted. Clients select and confirm hire; billing is
            generated after hire.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <label htmlFor="pipeline-search" className="sr-only">
          Search pipeline applications
        </label>
        <input
          id="pipeline-search"
          type="text"
          placeholder="Search by candidate, role, employer, location, skills, job, company, source, or status..."
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

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter("ALL")}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            statusFilter === "ALL"
              ? "bg-black text-white"
              : "bg-zinc-100 text-black hover:bg-zinc-200"
          }`}
        >
          All
        </button>

        {APPLICATION_PIPELINE_STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setStatusFilter(option.value)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              statusFilter === option.value
                ? "bg-black text-white"
                : "bg-zinc-100 text-black hover:bg-zinc-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {filteredApplications.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 bg-white py-20 text-center">
          <p className="text-lg font-medium text-black">
            {initialApplications.length === 0
              ? "No applications in the pipeline"
              : "No matching applications"}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {initialApplications.length === 0
              ? "Create applications to start moving candidates through the workflow."
              : "Try a different search or status filter."}
          </p>
        </div>
      ) : (
        <div className="mt-8 flex gap-4 overflow-x-auto pb-4">
          {visibleColumns.map((status) => {
            const columnApplications = applicationsByStatus[status];

            return (
              <section
                key={status}
                aria-label={`${getApplicationPipelineStatusLabel(status)} column`}
                className="w-80 shrink-0 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
                    {getApplicationPipelineStatusLabel(status)}
                  </h2>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-600">
                    {columnApplications.length}
                  </span>
                </div>

                <div className="mt-4 space-y-4">
                  {columnApplications.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-3 py-8 text-center text-sm text-zinc-500">
                      No applications
                    </p>
                  ) : (
                    columnApplications.map((application) => (
                      <PipelineCard
                        key={application.id}
                        id={application.id}
                        candidateName={application.candidate.name}
                        candidateRole={application.candidate.role}
                        currentEmployer={application.candidate.currentEmployer}
                        location={application.candidate.location}
                        experienceYears={application.candidate.experienceYears}
                        skills={application.candidate.skills}
                        expectedCTC={application.candidate.expectedCTC}
                        jobTitle={application.job.title}
                        companyName={application.job.company.name}
                        source={application.source}
                        expertScore={application.expertScore}
                        status={application.status}
                        moveOptions={getValidApplicationStatusTransitions(
                          application.status,
                        ).map((nextStatus) => ({
                          status: nextStatus,
                          label: getMoveLabel(nextStatus),
                        }))}
                        monitorNote={getMonitorNote(application.status)}
                        isMoving={movingApplicationId === application.id}
                        isSelected={selectedIds.includes(application.id)}
                        onToggleSelect={toggleSelected}
                        requirementHref={`/dashboard/requirements/${application.jobId}`}
                        onMove={handleMove}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {selectedIds.length > 0 && (
        <BulkActionsBar
          selected={selectedIds
            .map((id) => initialApplications.find((a) => a.id === id))
            .filter(
              (a): a is Application => Boolean(a),
            )
            .map((a) => ({
              id: a.id,
              status: a.status,
              name: a.candidate.name,
              expertScore: a.expertScore,
            }))}
        />
      )}
    </DashboardLayout>
  );
}

export default function PipelineClient(props: PipelineClientProps) {
  return (
    <Suspense fallback={null}>
      <PipelineClientInner {...props} />
    </Suspense>
  );
}

"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";

import type { getApplications } from "@/lib/repositories/application-repository";
import type { getJobs } from "@/lib/repositories/job-repository";
import {
  APPLICATION_PIPELINE_STATUS_OPTIONS,
  type ApplicationCandidateOption,
  getApplicationPipelineStatusLabel,
  type ApplicationFormData,
} from "@/components/applications/ApplicationForm";
import {
  createApplication,
  deleteApplication,
  updateApplication,
} from "@/app/actions/application-actions";
import type { ApplicationPipelineStatus } from "@prisma/client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import WorkflowRequirementNav, {
  useRequirementIdFilter,
} from "@/components/dashboard/WorkflowRequirementNav";
import ApplicationCard from "@/components/applications/ApplicationCard";
import ApplicationModal from "@/components/applications/ApplicationModal";

type RepositoryApplication = Awaited<ReturnType<typeof getApplications>>[number];
type Application = Omit<RepositoryApplication, "candidate"> & {
  candidate: Omit<RepositoryApplication["candidate"], "status">;
};
type Candidate = ApplicationCandidateOption;
type Job = Awaited<ReturnType<typeof getJobs>>[number];
type StatusFilter = "ALL" | ApplicationPipelineStatus;

type ApplicationsClientProps = {
  initialApplications: Application[];
  candidates: Candidate[];
  jobs: Job[];
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function ApplicationsClientInner({
  initialApplications,
  candidates,
  jobs,
}: ApplicationsClientProps) {
  const router = useRouter();
  const requirementIdFilter = useRequirementIdFilter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [actionError, setActionError] = useState("");
  const [editingApplication, setEditingApplication] =
    useState<Application | null>(null);

  const requirementOptions = jobs.map((job) => ({
    id: job.id,
    title: job.title,
  }));

  async function handleSaveApplication(application: ApplicationFormData) {
    setActionError("");

    try {
      if (editingApplication) {
        await updateApplication(
          editingApplication.id,
          application.candidateId,
          application.jobId,
          application.status,
          application.source,
          application.expertScore,
          application.rejectionReason,
        );
      } else {
        await createApplication(
          application.candidateId,
          application.jobId,
          application.status,
          application.source,
          application.expertScore,
          application.rejectionReason,
        );
      }

      setEditingApplication(null);
      setIsModalOpen(false);

      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  function handleEditApplication(id: number) {
    const application = initialApplications.find(
      (application) => application.id === id,
    );

    if (!application) return;

    setActionError("");
    setEditingApplication(application);
    setIsModalOpen(true);
  }

  async function handleDeleteApplication(id: number) {
    setActionError("");

    try {
      await deleteApplication(id);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  function openCreateModal() {
    setEditingApplication(null);
    setActionError("");
    setIsModalOpen(true);
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
    const searchableValues = [
      application.candidate.name,
      application.candidate.role,
      application.candidate.currentEmployer,
      application.candidate.location,
      application.candidate.skills,
      application.job.title,
      application.job.company.name,
      application.status,
      getApplicationPipelineStatusLabel(application.status),
    ];

    return searchableValues.some((value) =>
      (value ?? "").toLowerCase().includes(query),
    );
  });

  return (
    <DashboardLayout>
      <WorkflowRequirementNav requirements={requirementOptions} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">Applications</h1>

          <p className="mt-2 text-zinc-600">
            Manage requirement-specific candidate profile pipelines.
          </p>
        </div>

        <div className="mt-8">
          <label htmlFor="applications-search" className="sr-only">
            Search applications
          </label>
          <input
            id="applications-search"
            type="text"
            placeholder="Search by candidate, role, company, job, or status..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="
              w-full
              rounded-xl
              border
              border-zinc-300
              bg-white
              px-4
              py-3
              text-black
              placeholder:text-zinc-400
              outline-none
              transition
              focus:border-black
            "
          />
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
          + Add Application
        </button>
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

      {actionError && !isModalOpen && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {filteredApplications.length === 0 ? (
        <div className="mt-10">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20">
            <div className="text-5xl">🗂️</div>

            <h2 className="mt-6 text-2xl font-bold text-black">
              No applications found
            </h2>

            <p className="mt-3 text-center text-zinc-600">
              Try a different search or create a new application.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredApplications.map((application) => (
            <ApplicationCard
              key={application.id}
              id={application.id}
              candidateName={application.candidate.name}
              candidateRole={application.candidate.role}
              candidateExperienceYears={application.candidate.experienceYears}
              currentEmployer={application.candidate.currentEmployer}
              location={application.candidate.location}
              skills={application.candidate.skills}
              expectedCTC={application.candidate.expectedCTC}
              jobTitle={application.job.title}
              companyName={application.job.company.name}
              status={application.status}
              source={application.source}
              expertScore={application.expertScore}
              rejectionReason={application.rejectionReason}
              onEdit={handleEditApplication}
              onDelete={handleDeleteApplication}
            />
          ))}
        </div>
      )}

      <ApplicationModal
        isOpen={isModalOpen}
        onClose={() => {
          setEditingApplication(null);
          setIsModalOpen(false);
        }}
        onCreate={handleSaveApplication}
        candidates={candidates}
        jobs={jobs}
        initialValues={
          editingApplication
            ? {
                candidateId: editingApplication.candidateId,
                jobId: editingApplication.jobId,
                status: editingApplication.status,
                source: editingApplication.source,
                expertScore: editingApplication.expertScore,
                rejectionReason: editingApplication.rejectionReason,
              }
            : undefined
        }
        errorMessage={actionError}
      />
    </DashboardLayout>
  );
}

export default function ApplicationsClient(props: ApplicationsClientProps) {
  return (
    <Suspense fallback={null}>
      <ApplicationsClientInner {...props} />
    </Suspense>
  );
}

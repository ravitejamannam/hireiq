"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RequirementLifecycle } from "@prisma/client";

import type { getInterviewers } from "@/lib/repositories/interviewer-repository";
import type { getJobs } from "@/lib/repositories/job-repository";
import type { Company } from "@/types/company";
import type { JobFormData } from "@/components/jobs/JobForm";
import {
  assignInterviewerToJob,
  completeJobRequirement,
  completeJobShortlisting,
  createJob,
  deleteJob,
  markJobSourcingAccessReceived,
  notifyAssignedInterviewer,
  transitionJobLifecycle,
  updateJob,
} from "@/app/actions/job-actions";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import JobCard from "@/components/jobs/JobCard";
import JobModal from "@/components/jobs/JobModal";

type Job = Awaited<ReturnType<typeof getJobs>>[number];
type Interviewer = Awaited<ReturnType<typeof getInterviewers>>[number];

type JobsClientProps = {
  initialJobs: Job[];
  companies: Company[];
  interviewers: Interviewer[];
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export default function JobsClient({
  initialJobs,
  companies,
  interviewers,
}: JobsClientProps) {
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [advancingJobId, setAdvancingJobId] = useState<number | null>(null);
  const [assigningJobId, setAssigningJobId] = useState<number | null>(null);
  const [recordingAccessJobId, setRecordingAccessJobId] = useState<
    number | null
  >(null);
  const [completingShortlistingJobId, setCompletingShortlistingJobId] =
    useState<number | null>(null);
  const [postingRequirementJobId, setPostingRequirementJobId] = useState<
    number | null
  >(null);
  const [notifyingInterviewerJobId, setNotifyingInterviewerJobId] = useState<
    number | null
  >(null);
  const [search, setSearch] = useState("");
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [actionError, setActionError] = useState("");

  async function handleSaveJob(job: JobFormData) {
    setIsSaving(true);
    setActionError("");

    try {
      if (editingJob) {
        await updateJob(
          editingJob.id,
          job.title,
          job.status,
          job.companyId,
          job.requirementFields,
        );
      } else {
        await createJob(
          job.title,
          job.status,
          job.companyId,
          job.requirementFields,
        );
      }

      setEditingJob(null);
      setIsModalOpen(false);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAdvanceLifecycle(
    id: number,
    nextLifecycle: RequirementLifecycle,
  ) {
    setActionError("");
    setAdvancingJobId(id);

    try {
      await transitionJobLifecycle(id, nextLifecycle);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setAdvancingJobId(null);
    }
  }

  async function handleAssignInterviewer(
    jobId: number,
    interviewerId: number | null,
  ) {
    setActionError("");
    setAssigningJobId(jobId);

    try {
      await assignInterviewerToJob(jobId, interviewerId);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setAssigningJobId(null);
    }
  }

  async function handleMarkAccessReceived(jobId: number) {
    setActionError("");
    setRecordingAccessJobId(jobId);

    try {
      await markJobSourcingAccessReceived(jobId);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setRecordingAccessJobId(null);
    }
  }

  async function handleCompleteRequirement(jobId: number) {
    setActionError("");
    setPostingRequirementJobId(jobId);

    try {
      await completeJobRequirement(jobId);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setPostingRequirementJobId(null);
    }
  }

  async function handleNotifyInterviewer(jobId: number) {
    setActionError("");
    setNotifyingInterviewerJobId(jobId);

    try {
      await notifyAssignedInterviewer(jobId);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setNotifyingInterviewerJobId(null);
    }
  }

  async function handleCompleteShortlisting(jobId: number) {
    setActionError("");
    setCompletingShortlistingJobId(jobId);

    try {
      await completeJobShortlisting(jobId);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setCompletingShortlistingJobId(null);
    }
  }

  function openCreateModal() {
    setEditingJob(null);
    setActionError("");
    setIsModalOpen(true);
  }

  function handleEditJob(id: number) {
    const job = initialJobs.find((job) => job.id === id);

    if (!job) return;

    setActionError("");
    setEditingJob(job);
    setIsModalOpen(true);
  }

  async function handleDeleteJob(id: number) {
    setActionError("");

    try {
      await deleteJob(id);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  const normalizedSearch = search.toLowerCase();
  const filteredJobs = initialJobs.filter((job) => {
    const searchableValues = [
      job.title,
      job.company.name,
      job.location,
      job.roleCategory,
    ];

    return searchableValues.some((value) =>
      value?.toLowerCase().includes(normalizedSearch),
    );
  });

  const activeEditingJob = editingJob
    ? (initialJobs.find((job) => job.id === editingJob.id) ?? editingJob)
    : null;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Requirement / Post Role
          </p>
          <h1 className="mt-2 text-3xl font-bold text-black">
            Requirements / Roles
          </h1>

          <p className="mt-2 max-w-2xl text-zinc-600">
            Draft client hiring requirements, capture role details, and move
            each requirement through the source-defined lifecycle one stage at a
            time.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          + Post Role
        </button>
      </div>

      <div className="mt-8 max-w-md">
        <label htmlFor="requirements-search" className="sr-only">
          Search requirements
        </label>
        <input
          id="requirements-search"
          type="text"
          placeholder="Search by role, company, location, or category..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-black placeholder:text-zinc-400 outline-none transition focus:border-black"
        />
      </div>

      {actionError && !isModalOpen && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {filteredJobs.length === 0 ? (
        <div className="mt-10">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20">
            <div className="text-5xl">📋</div>

            <h2 className="mt-6 text-2xl font-bold text-black">
              No requirements found
            </h2>

            <p className="mt-3 text-center text-zinc-600">
              Try a different search or post a new role draft.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              id={job.id}
              title={job.title}
              company={job.company.name}
              status={job.status}
              requirementLifecycle={job.requirementLifecycle}
              roleCategory={job.roleCategory}
              location={job.location}
              compensationRange={job.compensationRange}
              numberOfPositions={job.numberOfPositions}
              sourcingDatabaseSource={job.sourcingDatabaseSource}
              sourcingAccessReceivedAt={job.sourcingAccessReceivedAt}
              shortlistingDueAt={job.shortlistingDueAt}
              shortlistingCompletedAt={job.shortlistingCompletedAt}
              applicationCount={job._count.applications}
              assignedInterviewerId={job.assignedInterviewerId}
              assignedInterviewer={job.assignedInterviewer}
              interviewers={interviewers}
              clientCompletedAt={job.clientCompletedAt}
              isAdvancing={advancingJobId === job.id}
              isAssigning={assigningJobId === job.id}
              isRecordingAccess={recordingAccessJobId === job.id}
              isCompletingShortlisting={completingShortlistingJobId === job.id}
              isPostingRequirement={postingRequirementJobId === job.id}
              isNotifyingInterviewer={notifyingInterviewerJobId === job.id}
              onAdvanceLifecycle={handleAdvanceLifecycle}
              onAssignInterviewer={handleAssignInterviewer}
              onMarkAccessReceived={handleMarkAccessReceived}
              onCompleteShortlisting={handleCompleteShortlisting}
              onCompleteRequirement={handleCompleteRequirement}
              onNotifyInterviewer={handleNotifyInterviewer}
              onEdit={handleEditJob}
              onDelete={handleDeleteJob}
            />
          ))}
        </div>
      )}

      <JobModal
        isOpen={isModalOpen}
        onClose={() => {
          setEditingJob(null);
          setActionError("");
          setIsModalOpen(false);
        }}
        onCreate={handleSaveJob}
        companies={companies}
        errorMessage={actionError}
        isSaving={isSaving}
        isRecordingAccess={
          activeEditingJob
            ? recordingAccessJobId === activeEditingJob.id
            : false
        }
        isCompletingShortlisting={
          activeEditingJob
            ? completingShortlistingJobId === activeEditingJob.id
            : false
        }
        isPostingRequirement={
          activeEditingJob
            ? postingRequirementJobId === activeEditingJob.id
            : false
        }
        isNotifyingInterviewer={
          activeEditingJob
            ? notifyingInterviewerJobId === activeEditingJob.id
            : false
        }
        assignedInterviewer={activeEditingJob?.assignedInterviewer ?? null}
        onMarkAccessReceived={
          activeEditingJob
            ? () => handleMarkAccessReceived(activeEditingJob.id)
            : undefined
        }
        onCompleteShortlisting={
          activeEditingJob
            ? () => handleCompleteShortlisting(activeEditingJob.id)
            : undefined
        }
        onCompleteRequirement={
          activeEditingJob
            ? () => handleCompleteRequirement(activeEditingJob.id)
            : undefined
        }
        onNotifyInterviewer={
          activeEditingJob
            ? () => handleNotifyInterviewer(activeEditingJob.id)
            : undefined
        }
        initialValues={
          activeEditingJob
            ? {
                title: activeEditingJob.title,
                status: activeEditingJob.status,
                companyId: activeEditingJob.companyId,
                roleCategory: activeEditingJob.roleCategory,
                experienceRange: activeEditingJob.experienceRange,
                location: activeEditingJob.location,
                compensationRange: activeEditingJob.compensationRange,
                targetHireDate: activeEditingJob.targetHireDate,
                numberOfPositions: activeEditingJob.numberOfPositions,
                mustHaveRequirements: activeEditingJob.mustHaveRequirements,
                niceToHaveRequirements:
                  activeEditingJob.niceToHaveRequirements,
                jobDescription: activeEditingJob.jobDescription,
                evaluationCriteria: activeEditingJob.evaluationCriteria,
                primarySkills: activeEditingJob.primarySkills,
                requirementLifecycle: activeEditingJob.requirementLifecycle,
                clientCompletedAt: activeEditingJob.clientCompletedAt,
                sourcingDatabaseSource:
                  activeEditingJob.sourcingDatabaseSource,
                sourcingAccessDetails: activeEditingJob.sourcingAccessDetails,
                sourcingAccessReceivedAt:
                  activeEditingJob.sourcingAccessReceivedAt,
                shortlistingDueAt: activeEditingJob.shortlistingDueAt,
                shortlistingCompletedAt:
                  activeEditingJob.shortlistingCompletedAt,
              }
            : undefined
        }
      />
    </DashboardLayout>
  );
}

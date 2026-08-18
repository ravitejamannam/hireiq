"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApplicationPipelineStatus,
  type RequirementLifecycle,
} from "@prisma/client";

import { createSourcedApplication } from "@/app/actions/application-actions";
import {
  APPLICATION_PIPELINE_STATUS_OPTIONS,
  getApplicationPipelineStatusLabel,
} from "@/components/applications/ApplicationForm";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import WorkflowRequirementNav, {
  useRequirementIdFilter,
} from "@/components/dashboard/WorkflowRequirementNav";
import {
  getSlaStatus,
  getSourceTargetLabel,
  getSourcingDatabaseLabel,
} from "@/components/jobs/JobCard";
import SourcedProfileForm from "@/components/sourcing/SourcedProfileForm";
import type { SourcedProfileFormData } from "@/components/sourcing/SourcedProfileForm";
import SourcingProfileCard from "@/components/sourcing/SourcingProfileCard";
import type { getApplications } from "@/lib/repositories/application-repository";
import type { getJobs } from "@/lib/repositories/job-repository";

type Job = Awaited<ReturnType<typeof getJobs>>[number];
type Application = Awaited<ReturnType<typeof getApplications>>[number];
type StatusFilter = "ALL" | ApplicationPipelineStatus;

type SourcingClientProps = {
  initialJobs: Job[];
  initialApplications: Application[];
};

const SOURCING_LIFECYCLES: RequirementLifecycle[] = [
  "INTERVIEWER_NOTIFIED",
  "SOURCING_SHORTLISTING",
];

const requirementLifecycleLabels: Record<RequirementLifecycle, string> = {
  REQUIREMENT_POSTED: "Requirement Posted",
  INTERVIEWER_NOTIFIED: "Interviewer Notified",
  SOURCING_SHORTLISTING: "Sourcing & Shortlisting",
  BILLING_GENERATED: "Billing Generated",
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export default function SourcingClient(props: SourcingClientProps) {
  return (
    <Suspense fallback={null}>
      <SourcingClientInner {...props} />
    </Suspense>
  );
}

function SourcingClientInner({
  initialJobs,
  initialApplications,
}: SourcingClientProps) {
  const router = useRouter();
  const requirementIdFilter = useRequirementIdFilter();

  const sourcingJobs = useMemo(
    () =>
      initialJobs.filter((job) =>
        SOURCING_LIFECYCLES.includes(job.requirementLifecycle),
      ),
    [initialJobs],
  );

  const [manualSelectedJobId, setManualSelectedJobId] = useState<number | null>(
    sourcingJobs[0]?.id ?? null,
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    ApplicationPipelineStatus.CV_POOL,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedJobId =
    requirementIdFilter !== null &&
    sourcingJobs.some((job) => job.id === requirementIdFilter)
      ? requirementIdFilter
      : manualSelectedJobId;

  const requirementOptions = sourcingJobs.map((job) => ({
    id: job.id,
    title: job.title,
  }));

  const selectedJob =
    sourcingJobs.find((job) => job.id === selectedJobId) ?? null;

  const hasDatabaseAccess = Boolean(selectedJob?.sourcingAccessReceivedAt);
  const canIntake =
    Boolean(selectedJob) &&
    hasDatabaseAccess &&
    (selectedJob?.requirementLifecycle === "INTERVIEWER_NOTIFIED" ||
      selectedJob?.requirementLifecycle === "SOURCING_SHORTLISTING");

  const jobApplications = useMemo(() => {
    if (!selectedJob) return [];

    return initialApplications.filter(
      (application) => application.jobId === selectedJob.id,
    );
  }, [initialApplications, selectedJob]);

  const profileCount = selectedJob
    ? selectedJob._count.applications
    : jobApplications.length;

  const slaStatus = selectedJob
    ? getSlaStatus({
        shortlistingCompletedAt: selectedJob.shortlistingCompletedAt,
        shortlistingDueAt: selectedJob.shortlistingDueAt,
      })
    : "NOT_STARTED";

  const filteredApplications = jobApplications.filter((application) => {
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
    ];

    return searchableValues.some(
      (value) => value?.toLowerCase().includes(query) ?? false,
    );
  });

  async function handleAddProfile(data: SourcedProfileFormData) {
    if (!selectedJob || !canIntake) {
      throw new Error(
        "Database access has not been received for this requirement.",
      );
    }

    setActionError("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      await createSourcedApplication(
        selectedJob.id,
        {
          name: data.name,
          role: data.role,
          experienceYears: data.experienceYears,
          location: data.location,
          currentEmployer: data.currentEmployer,
          skills: data.skills,
          expectedCTC: data.expectedCTC,
        },
        data.source,
      );

      setSuccessMessage("Profile added to CV Pool.");
      router.refresh();
    } catch (error) {
      const message = getErrorMessage(error);
      setActionError(message);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DashboardLayout>
      <WorkflowRequirementNav requirements={requirementOptions} />
      <div>
        <h1 className="text-3xl font-bold text-black">Sourcing</h1>
        <p className="mt-2 text-zinc-600">
          Manual interviewer profile intake into requirement CV pools.
        </p>
      </div>

      {sourcingJobs.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 bg-white py-20 text-center">
          <p className="text-lg font-medium text-black">
            No sourcing-ready requirements
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Notify an interviewer and record database access before sourcing
            profiles.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <div>
            <label
              htmlFor="sourcing-job"
              className="block text-sm font-medium text-black"
            >
              Requirement
            </label>
            <select
              id="sourcing-job"
              value={selectedJobId ?? ""}
              onChange={(event) => {
                setManualSelectedJobId(Number(event.target.value));
                setActionError("");
                setSuccessMessage("");
              }}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black md:max-w-xl"
            >
              {sourcingJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} — {job.company.name} —{" "}
                  {requirementLifecycleLabels[job.requirementLifecycle]}
                </option>
              ))}
            </select>
          </div>

          {selectedJob && (
            <>
              <section className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-6 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <p className="text-sm font-medium text-zinc-500">Requirement</p>
                  <p className="mt-1 text-lg font-semibold text-black">
                    {selectedJob.title}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {selectedJob.company.name}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-500">Lifecycle</p>
                  <p className="mt-1 text-sm font-medium text-black">
                    {
                      requirementLifecycleLabels[
                        selectedJob.requirementLifecycle
                      ]
                    }
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-500">
                    Assigned interviewer
                  </p>
                  <p className="mt-1 text-sm font-medium text-black">
                    {selectedJob.assignedInterviewer
                      ? selectedJob.assignedInterviewer.name
                      : "Not assigned"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-500">Database</p>
                  <p className="mt-1 text-sm font-medium text-black">
                    {getSourcingDatabaseLabel(
                      selectedJob.sourcingDatabaseSource,
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-500">Access</p>
                  <p className="mt-1 text-sm font-medium text-black">
                    {hasDatabaseAccess ? "Received" : "Not received"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-500">SLA</p>
                  <p className="mt-1 text-sm font-medium text-black">
                    {slaStatus === "ACTIVE"
                      ? "Active"
                      : slaStatus === "OVERDUE"
                        ? "Overdue"
                        : slaStatus === "COMPLETED"
                          ? "Completed"
                          : "Not started"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-500">
                    Profiles sourced
                  </p>
                  <p className="mt-1 text-sm font-medium text-black">
                    {profileCount}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-500">Target</p>
                  <p className="mt-1 text-sm font-medium text-black">50–100</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {getSourceTargetLabel(profileCount)}
                  </p>
                </div>
              </section>

              {!hasDatabaseAccess && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Database access has not been received. Record access from the
                  Jobs workflow before adding profiles.
                </div>
              )}

              <SourcedProfileForm
                disabled={!canIntake}
                isSubmitting={isSubmitting}
                errorMessage={actionError}
                successMessage={successMessage}
                onSubmit={handleAddProfile}
              />

              <div className="flex flex-col gap-4 md:flex-row md:items-end">
                <div className="flex-1">
                  <label
                    htmlFor="sourcing-search"
                    className="block text-sm font-medium text-black"
                  >
                    Search profiles
                  </label>
                  <input
                    id="sourcing-search"
                    type="text"
                    placeholder="Search by name, role, employer, location, or skills..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
                  />
                </div>
                <div>
                  <label
                    htmlFor="sourcing-status-filter"
                    className="block text-sm font-medium text-black"
                  >
                    Status
                  </label>
                  <select
                    id="sourcing-status-filter"
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as StatusFilter)
                    }
                    className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black md:min-w-48"
                  >
                    <option value="ALL">All</option>
                    {APPLICATION_PIPELINE_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredApplications.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
                  <p className="text-lg font-medium text-black">
                    {jobApplications.length === 0
                      ? "No sourced profiles yet"
                      : "No matching profiles"}
                  </p>
                  <p className="mt-2 text-sm text-zinc-500">
                    {jobApplications.length === 0
                      ? statusFilter === ApplicationPipelineStatus.CV_POOL
                        ? "Add a profile to start the CV Pool for this requirement."
                        : `No profiles in ${statusFilter === "ALL" ? "any status" : getApplicationPipelineStatusLabel(statusFilter)}.`
                      : "Try a different search or status filter."}
                  </p>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {filteredApplications.map((application) => (
                    <SourcingProfileCard
                      key={application.id}
                      candidateName={application.candidate.name}
                      role={application.candidate.role}
                      currentEmployer={application.candidate.currentEmployer}
                      location={application.candidate.location}
                      experienceYears={application.candidate.experienceYears}
                      skills={application.candidate.skills}
                      expectedCTC={application.candidate.expectedCTC}
                      source={application.source}
                      status={application.status}
                      expertScore={application.expertScore}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}

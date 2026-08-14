"use client";

import { useState } from "react";
import type {
  InterviewerAvailability,
  InterviewerCategory,
  JobStatus,
  RequirementLifecycle,
  RoleCategory,
  SourcingDatabaseSource,
} from "@prisma/client";
import type { Company } from "@/types/company";
import { formatJobDateTime } from "@/components/jobs/JobCard";

type AssignedInterviewerSummary = {
  id: number;
  name: string;
  category: InterviewerCategory;
  availability: InterviewerAvailability;
};

const interviewerCategoryLabels: Record<InterviewerCategory, string> = {
  ENGINEERING: "Engineering",
  DATA_SCIENCE: "Data Science",
  PRODUCT: "Product",
  DESIGN: "Design",
};

const availabilityLabels: Record<InterviewerAvailability, string> = {
  AVAILABLE: "Available",
  NOT_AVAILABLE: "Not Available",
};

const jobStatusOptions = [
  { value: "OPEN", label: "Open" },
  { value: "CLOSED", label: "Closed" },
  { value: "FILLED", label: "Filled" },
] as const satisfies ReadonlyArray<{ value: JobStatus; label: string }>;

const roleCategoryOptions = [
  { value: "ENGINEERING", label: "Engineering" },
  { value: "SALES", label: "Sales" },
  { value: "DESIGN", label: "Design" },
  { value: "FINANCE", label: "Finance" },
] as const satisfies ReadonlyArray<{ value: RoleCategory; label: string }>;

const requirementLifecycleLabels: Record<RequirementLifecycle, string> = {
  REQUIREMENT_DRAFTED: "Requirement Drafted",
  CLIENT_NOTIFIED: "Client Notified",
  REQUIREMENT_POSTED: "Requirement Posted",
  INTERVIEWER_NOTIFIED: "Interviewer Notified",
  SOURCING_SHORTLISTING: "Sourcing & Shortlisting",
  BILLING_GENERATED: "Billing Generated",
};

const sourcingDatabaseOptions = [
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "NAUKRI", label: "Naukri" },
] as const satisfies ReadonlyArray<{
  value: SourcingDatabaseSource;
  label: string;
}>;

export type JobFormData = {
  title: string;
  status: JobStatus;
  companyId: number;
  requirementFields: {
    roleCategory: RoleCategory | null;
    experienceRange: string | null;
    location: string | null;
    compensationRange: string | null;
    targetHireDate: Date | null;
    numberOfPositions: number | null;
    mustHaveRequirements: string | null;
    niceToHaveRequirements: string | null;
    jobDescription: string | null;
    evaluationCriteria: string | null;
    primarySkills: string | null;
    sourcingDatabaseSource: SourcingDatabaseSource | null;
    sourcingAccessDetails: string | null;
  };
};

type JobFormInitialValues = Omit<JobFormData, "requirementFields"> &
  JobFormData["requirementFields"] & {
    requirementLifecycle: RequirementLifecycle;
    clientCompletedAt: Date | null;
    sourcingAccessReceivedAt: Date | null;
    shortlistingDueAt: Date | null;
    shortlistingCompletedAt: Date | null;
  };

type JobFormProps = {
  onCreate: (job: JobFormData) => void;
  onCancel: () => void;
  companies: Company[];
  initialValues?: JobFormInitialValues;
  errorMessage?: string;
  isSaving?: boolean;
  isRecordingAccess?: boolean;
  isCompletingShortlisting?: boolean;
  isPostingRequirement?: boolean;
  isNotifyingInterviewer?: boolean;
  assignedInterviewer?: AssignedInterviewerSummary | null;
  onMarkAccessReceived?: () => void;
  onCompleteShortlisting?: () => void;
  onCompleteRequirement?: () => void;
  onNotifyInterviewer?: () => void;
};

function formatDateInputValue(value: Date | string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeOptionalString(value: string) {
  return value.trim() || null;
}

function parseOptionalDate(value: string) {
  return value ? new Date(`${value}T00:00`) : null;
}

function WorkflowTimestampDisplay({
  label,
  value,
}: {
  label: string;
  value: Date | string | null | undefined;
}) {
  return (
    <div>
      <span className="block text-sm font-medium text-black">{label}</span>
      <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
        {value ? formatJobDateTime(new Date(value)) : "Not recorded"}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Set only by the dedicated workflow action.
      </p>
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  if (!message) return null;

  return <p className="mt-2 text-sm text-red-600">{message}</p>;
}

export default function JobForm({
  onCreate,
  onCancel,
  companies,
  initialValues,
  errorMessage,
  isSaving = false,
  isRecordingAccess = false,
  isCompletingShortlisting = false,
  isPostingRequirement = false,
  isNotifyingInterviewer = false,
  assignedInterviewer = null,
  onMarkAccessReceived,
  onCompleteShortlisting,
  onCompleteRequirement,
  onNotifyInterviewer,
}: JobFormProps) {
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [status, setStatus] = useState<JobStatus | "">(
    initialValues?.status ?? "",
  );
  const [companyId, setCompanyId] = useState(
    initialValues?.companyId.toString() ?? "",
  );
  const [roleCategory, setRoleCategory] = useState<RoleCategory | "">(
    initialValues?.roleCategory ?? "",
  );
  const [experienceRange, setExperienceRange] = useState(
    initialValues?.experienceRange ?? "",
  );
  const [location, setLocation] = useState(initialValues?.location ?? "");
  const [compensationRange, setCompensationRange] = useState(
    initialValues?.compensationRange ?? "",
  );
  const [targetHireDate, setTargetHireDate] = useState(
    formatDateInputValue(initialValues?.targetHireDate),
  );
  const [numberOfPositions, setNumberOfPositions] = useState(
    initialValues?.numberOfPositions?.toString() ?? "",
  );
  const [mustHaveRequirements, setMustHaveRequirements] = useState(
    initialValues?.mustHaveRequirements ?? "",
  );
  const [niceToHaveRequirements, setNiceToHaveRequirements] = useState(
    initialValues?.niceToHaveRequirements ?? "",
  );
  const [jobDescription, setJobDescription] = useState(
    initialValues?.jobDescription ?? "",
  );
  const [evaluationCriteria, setEvaluationCriteria] = useState(
    initialValues?.evaluationCriteria ?? "",
  );
  const [primarySkills, setPrimarySkills] = useState(
    initialValues?.primarySkills ?? "",
  );
  const currentRequirementLifecycle =
    initialValues?.requirementLifecycle ?? "REQUIREMENT_DRAFTED";
  const [sourcingDatabaseSource, setSourcingDatabaseSource] = useState<
    SourcingDatabaseSource | ""
  >(initialValues?.sourcingDatabaseSource ?? "");
  const [sourcingAccessDetails, setSourcingAccessDetails] = useState(
    initialValues?.sourcingAccessDetails ?? "",
  );

  const [titleError, setTitleError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [companyIdError, setCompanyIdError] = useState("");
  const [numberOfPositionsError, setNumberOfPositionsError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let valid = true;
    const parsedPositions = numberOfPositions
      ? Number(numberOfPositions)
      : null;

    setTitleError("");
    setStatusError("");
    setCompanyIdError("");
    setNumberOfPositionsError("");

    if (!title.trim()) {
      setTitleError("Role title is required.");
      valid = false;
    }

    if (!status) {
      setStatusError("Job status is required.");
      valid = false;
    }

    if (!companyId.trim()) {
      setCompanyIdError("Company is required.");
      valid = false;
    }

    if (
      parsedPositions !== null &&
      (!Number.isInteger(parsedPositions) || parsedPositions <= 0)
    ) {
      setNumberOfPositionsError(
        "Number of positions must be a positive integer.",
      );
      valid = false;
    }

    if (!valid || !status) return;

    onCreate({
      title: title.trim(),
      status,
      companyId: Number(companyId),
      requirementFields: {
        roleCategory: roleCategory || null,
        experienceRange: normalizeOptionalString(experienceRange),
        location: normalizeOptionalString(location),
        compensationRange: normalizeOptionalString(compensationRange),
        targetHireDate: parseOptionalDate(targetHireDate),
        numberOfPositions: parsedPositions,
        mustHaveRequirements: normalizeOptionalString(mustHaveRequirements),
        niceToHaveRequirements: normalizeOptionalString(niceToHaveRequirements),
        jobDescription: normalizeOptionalString(jobDescription),
        evaluationCriteria: normalizeOptionalString(evaluationCriteria),
        primarySkills: normalizeOptionalString(primarySkills),
        sourcingDatabaseSource: sourcingDatabaseSource || null,
        sourcingAccessDetails: normalizeOptionalString(sourcingAccessDetails),
      },
    });
  }

  return (
    <form className="mt-8 space-y-8" onSubmit={handleSubmit}>
      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-black">Role / Requirement</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Save a draft now; client-completed details can be filled later.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label
              htmlFor="job-title"
              className="block text-sm font-medium text-black"
            >
              Role Title
            </label>
            <input
              id="job-title"
              type="text"
              placeholder="K6 Performance Testing Engineer"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black placeholder:text-zinc-400 outline-none transition focus:border-black"
            />
            <FieldError message={titleError} />
          </div>

          <div>
            <label
              htmlFor="job-company"
              className="block text-sm font-medium text-black"
            >
              Company
            </label>
            <select
              id="job-company"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
            >
              <option value="">Select Company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <FieldError message={companyIdError} />
          </div>

          <div>
            <label
              htmlFor="job-status"
              className="block text-sm font-medium text-black"
            >
              Job Status
            </label>
            <select
              id="job-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as JobStatus)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
            >
              <option value="">Select Status</option>
              {jobStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError message={statusError} />
          </div>

          <div>
            <label
              htmlFor="job-role-category"
              className="block text-sm font-medium text-black"
            >
              Role Category
            </label>
            <select
              id="job-role-category"
              value={roleCategory}
              onChange={(event) =>
                setRoleCategory(event.target.value as RoleCategory | "")
              }
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
            >
              <option value="">Select Category</option>
              {roleCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="job-experience"
              className="block text-sm font-medium text-black"
            >
              Experience
            </label>
            <input
              id="job-experience"
              type="text"
              placeholder="3-5 years"
              value={experienceRange}
              onChange={(event) => setExperienceRange(event.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black placeholder:text-zinc-400 outline-none transition focus:border-black"
            />
          </div>

          <div>
            <label
              htmlFor="job-location"
              className="block text-sm font-medium text-black"
            >
              Location
            </label>
            <input
              id="job-location"
              type="text"
              placeholder="Bengaluru / Remote"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black placeholder:text-zinc-400 outline-none transition focus:border-black"
            />
          </div>

          <div>
            <label
              htmlFor="job-compensation"
              className="block text-sm font-medium text-black"
            >
              Compensation / CTC
            </label>
            <input
              id="job-compensation"
              type="text"
              placeholder="18-25 LPA"
              value={compensationRange}
              onChange={(event) => setCompensationRange(event.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black placeholder:text-zinc-400 outline-none transition focus:border-black"
            />
          </div>

          <div>
            <label
              htmlFor="job-positions"
              className="block text-sm font-medium text-black"
            >
              Number of Positions
            </label>
            <input
              id="job-positions"
              type="number"
              min="1"
              step="1"
              value={numberOfPositions}
              onChange={(event) => setNumberOfPositions(event.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
            />
            <FieldError message={numberOfPositionsError} />
          </div>

          <div>
            <label
              htmlFor="job-target-hire-date"
              className="block text-sm font-medium text-black"
            >
              Target Hire Date
            </label>
            <input
              id="job-target-hire-date"
              type="date"
              value={targetHireDate}
              onChange={(event) => setTargetHireDate(event.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-black">Requirements</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label
              htmlFor="job-primary-skills"
              className="block text-sm font-medium text-black"
            >
              Primary Skills
            </label>
            <input
              id="job-primary-skills"
              type="text"
              placeholder="K6, Grafana, JavaScript, CI/CD"
              value={primarySkills}
              onChange={(event) => setPrimarySkills(event.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black placeholder:text-zinc-400 outline-none transition focus:border-black"
            />
          </div>

          <div>
            <label
              htmlFor="job-must-have"
              className="block text-sm font-medium text-black"
            >
              Must-have Requirements
            </label>
            <textarea
              id="job-must-have"
              rows={4}
              value={mustHaveRequirements}
              onChange={(event) => setMustHaveRequirements(event.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
            />
          </div>

          <div>
            <label
              htmlFor="job-nice-to-have"
              className="block text-sm font-medium text-black"
            >
              Nice-to-have Requirements
            </label>
            <textarea
              id="job-nice-to-have"
              rows={4}
              value={niceToHaveRequirements}
              onChange={(event) =>
                setNiceToHaveRequirements(event.target.value)
              }
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
            />
          </div>

          <div>
            <label
              htmlFor="job-description"
              className="block text-sm font-medium text-black"
            >
              Job Description
            </label>
            <textarea
              id="job-description"
              rows={5}
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
            />
          </div>

          <div>
            <label
              htmlFor="job-evaluation-criteria"
              className="block text-sm font-medium text-black"
            >
              Evaluation Criteria
            </label>
            <textarea
              id="job-evaluation-criteria"
              rows={5}
              value={evaluationCriteria}
              onChange={(event) => setEvaluationCriteria(event.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-black">Sourcing</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="job-sourcing-database"
              className="block text-sm font-medium text-black"
            >
              Source Database
            </label>
            <select
              id="job-sourcing-database"
              value={sourcingDatabaseSource}
              onChange={(event) =>
                setSourcingDatabaseSource(
                  event.target.value as SourcingDatabaseSource | "",
                )
              }
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
            >
              <option value="">Select Source</option>
              {sourcingDatabaseOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-sm font-medium text-black">
              Access Received
            </span>
            <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
              {initialValues?.sourcingAccessReceivedAt
                ? formatJobDateTime(new Date(initialValues.sourcingAccessReceivedAt))
                : "Not recorded"}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Recorded by Mark Database Access Received.
            </p>
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="job-sourcing-access-details"
              className="block text-sm font-medium text-black"
            >
              Access Details
            </label>
            <textarea
              id="job-sourcing-access-details"
              rows={3}
              value={sourcingAccessDetails}
              onChange={(event) => setSourcingAccessDetails(event.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
            />
          </div>
        </div>

        {initialValues && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-semibold text-black">
              Sourcing Workflow
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              {initialValues.sourcingAccessReceivedAt
                ? "Access Received"
                : "Access Not Received"}
              {initialValues.shortlistingCompletedAt
                ? " · Shortlisting Completed"
                : ""}
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              {currentRequirementLifecycle === "INTERVIEWER_NOTIFIED" &&
                Boolean(sourcingDatabaseSource) &&
                !initialValues.sourcingAccessReceivedAt &&
                onMarkAccessReceived && (
                  <button
                    type="button"
                    onClick={onMarkAccessReceived}
                    disabled={isRecordingAccess || isSaving}
                    className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                  >
                    {isRecordingAccess
                      ? "Recording..."
                      : "Mark Database Access Received"}
                  </button>
                )}

              {initialValues.sourcingAccessReceivedAt && (
                <span className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700">
                  Access Received
                </span>
              )}

              {currentRequirementLifecycle === "SOURCING_SHORTLISTING" &&
                initialValues.sourcingAccessReceivedAt &&
                !initialValues.shortlistingCompletedAt &&
                onCompleteShortlisting && (
                  <button
                    type="button"
                    onClick={onCompleteShortlisting}
                    disabled={isCompletingShortlisting || isSaving}
                    className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                  >
                    {isCompletingShortlisting
                      ? "Completing..."
                      : "Complete Shortlisting"}
                  </button>
                )}

              {initialValues.shortlistingCompletedAt && (
                <span className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
                  Shortlisting Completed
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-black">Lifecycle / SLA</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <span className="block text-sm font-medium text-black">
              Requirement Lifecycle
            </span>
            <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
              {requirementLifecycleLabels[currentRequirementLifecycle]}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Lifecycle changes use the controlled stage action on the
              requirement card.
            </p>

            {initialValues && (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                  <p className="font-medium text-black">Assigned interviewer</p>
                  <p className="mt-1">
                    {assignedInterviewer
                      ? `${assignedInterviewer.name} / ${interviewerCategoryLabels[assignedInterviewer.category]} / ${availabilityLabels[assignedInterviewer.availability]}`
                      : "Not assigned"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {currentRequirementLifecycle === "CLIENT_NOTIFIED" &&
                    onCompleteRequirement && (
                      <button
                        type="button"
                        onClick={onCompleteRequirement}
                        disabled={isPostingRequirement || isSaving}
                        className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPostingRequirement
                          ? "Posting..."
                          : "Post Requirement"}
                      </button>
                    )}

                  {currentRequirementLifecycle === "REQUIREMENT_POSTED" && (
                    <span className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
                      Requirement Posted
                    </span>
                  )}

                  {currentRequirementLifecycle === "REQUIREMENT_POSTED" &&
                    assignedInterviewer &&
                    onNotifyInterviewer && (
                      <button
                        type="button"
                        onClick={onNotifyInterviewer}
                        disabled={isNotifyingInterviewer || isSaving}
                        className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isNotifyingInterviewer
                          ? "Notifying..."
                          : "Notify Interviewer"}
                      </button>
                    )}

                  {currentRequirementLifecycle === "REQUIREMENT_POSTED" &&
                    !assignedInterviewer && (
                      <span className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
                        Interviewer assignment required
                      </span>
                    )}

                  {currentRequirementLifecycle === "INTERVIEWER_NOTIFIED" && (
                    <span className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
                      Interviewer Notified
                    </span>
                  )}

                  {initialValues.clientCompletedAt && (
                    <span className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700">
                      Client completed recorded
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <WorkflowTimestampDisplay
            label="Client Completed Date & Time"
            value={initialValues?.clientCompletedAt}
          />

          <WorkflowTimestampDisplay
            label="Shortlisting Due Date & Time"
            value={initialValues?.shortlistingDueAt}
          />

          <WorkflowTimestampDisplay
            label="Shortlisting Completed Date & Time"
            value={initialValues?.shortlistingCompletedAt}
          />
        </div>
      </section>

      <div className="flex justify-end gap-3 border-t border-zinc-200 pt-6">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-zinc-300 bg-white px-5 py-3 font-medium text-black transition hover:bg-zinc-100"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-black px-5 py-3 font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isSaving
            ? "Saving..."
            : initialValues
              ? "Save Requirement"
              : "Save Draft Requirement"}
        </button>
      </div>
    </form>
  );
}

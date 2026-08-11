import type {
  InterviewerAvailability,
  InterviewerCategory,
  JobStatus,
  RequirementLifecycle,
  RoleCategory,
} from "@prisma/client";

type InterviewerOption = {
  id: number;
  name: string;
  category: InterviewerCategory;
  availability: InterviewerAvailability;
};

type JobCardProps = {
  id: number;
  title: string;
  company: string;
  status: JobStatus;
  requirementLifecycle: RequirementLifecycle;
  roleCategory: RoleCategory | null;
  location: string | null;
  compensationRange: string | null;
  numberOfPositions: number | null;
  assignedInterviewerId: number | null;
  assignedInterviewer: InterviewerOption | null;
  interviewers: InterviewerOption[];
  isAdvancing?: boolean;
  isAssigning?: boolean;
  onAdvanceLifecycle: (id: number, nextLifecycle: RequirementLifecycle) => void;
  onAssignInterviewer: (jobId: number, interviewerId: number | null) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

const jobStatusLabels: Record<JobStatus, string> = {
  OPEN: "Open",
  CLOSED: "Closed",
  FILLED: "Filled",
};

const requirementLifecycleLabels: Record<RequirementLifecycle, string> = {
  REQUIREMENT_DRAFTED: "Requirement Drafted",
  CLIENT_NOTIFIED: "Client Notified",
  REQUIREMENT_POSTED: "Requirement Posted",
  INTERVIEWER_NOTIFIED: "Interviewer Notified",
  SOURCING_SHORTLISTING: "Sourcing & Shortlisting",
  BILLING_GENERATED: "Billing Generated",
};

const nextRequirementLifecycle: Partial<Record<RequirementLifecycle, RequirementLifecycle>> = {
  REQUIREMENT_DRAFTED: "CLIENT_NOTIFIED",
  CLIENT_NOTIFIED: "REQUIREMENT_POSTED",
  REQUIREMENT_POSTED: "INTERVIEWER_NOTIFIED",
  INTERVIEWER_NOTIFIED: "SOURCING_SHORTLISTING",
};

const roleCategoryLabels: Record<RoleCategory, string> = {
  ENGINEERING: "Engineering",
  SALES: "Sales",
  DESIGN: "Design",
  FINANCE: "Finance",
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

export default function JobCard({
  id,
  title,
  company,
  status,
  requirementLifecycle,
  roleCategory,
  location,
  compensationRange,
  numberOfPositions,
  assignedInterviewerId,
  assignedInterviewer,
  interviewers,
  isAdvancing = false,
  isAssigning = false,
  onAdvanceLifecycle,
  onAssignInterviewer,
  onEdit,
  onDelete,
}: JobCardProps) {
  const nextLifecycle = nextRequirementLifecycle[requirementLifecycle];
  const isBillingBlocked = requirementLifecycle === "SOURCING_SHORTLISTING";

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-black">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Requirement / Role
          </p>
          <h3 className="mt-2 text-xl font-bold text-black">{title}</h3>
          <p className="mt-1 text-zinc-500">{company}</p>
        </div>
        <div className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-black">
          {jobStatusLabels[status]}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          {requirementLifecycleLabels[requirementLifecycle]}
        </span>
        {roleCategory && (
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
            {roleCategoryLabels[roleCategory]}
          </span>
        )}
      </div>

      <dl className="mt-6 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
        {location && (
          <div>
            <dt className="font-medium text-black">Location</dt>
            <dd className="mt-1">{location}</dd>
          </div>
        )}
        {compensationRange && (
          <div>
            <dt className="font-medium text-black">Compensation</dt>
            <dd className="mt-1">{compensationRange}</dd>
          </div>
        )}
        {numberOfPositions && (
          <div>
            <dt className="font-medium text-black">Positions</dt>
            <dd className="mt-1">{numberOfPositions}</dd>
          </div>
        )}
      </dl>

      <div className="mt-6 rounded-lg bg-zinc-50 p-4">
        <label htmlFor={`job-${id}-interviewer`} className="block text-sm font-medium text-black">
          Assigned Interviewer
        </label>
        <p className="mt-1 text-sm text-zinc-600">
          {assignedInterviewer ? assignedInterviewer.name : "Not assigned"}
        </p>
        <select
          id={`job-${id}-interviewer`}
          value={assignedInterviewerId?.toString() ?? ""}
          onChange={(event) =>
            onAssignInterviewer(
              id,
              event.target.value ? Number(event.target.value) : null,
            )
          }
          disabled={isAssigning}
          className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-black disabled:cursor-not-allowed disabled:bg-zinc-100"
        >
          <option value="">Not assigned</option>
          {interviewers.map((interviewer) => (
            <option key={interviewer.id} value={interviewer.id}>
              {interviewer.name} — {interviewerCategoryLabels[interviewer.category]} — {availabilityLabels[interviewer.availability]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-8 border-t border-zinc-200 pt-4">
        <div className="flex flex-wrap justify-end gap-3">
          {nextLifecycle && (
            <button
              type="button"
              onClick={() => onAdvanceLifecycle(id, nextLifecycle)}
              disabled={isAdvancing}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {isAdvancing ? "Moving..." : `Move to ${requirementLifecycleLabels[nextLifecycle]}`}
            </button>
          )}

          {isBillingBlocked && (
            <button
              type="button"
              disabled
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-400"
            >
              Billing workflow unavailable
            </button>
          )}

          <button
            type="button"
            onClick={() => onEdit(id)}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-black hover:bg-zinc-100"
          >
            Edit Requirement
          </button>

          <button
            type="button"
            onClick={() => onDelete(id)}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

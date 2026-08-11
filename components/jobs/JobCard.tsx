import type {
  InterviewerAvailability,
  InterviewerCategory,
  JobStatus,
  RequirementLifecycle,
  RoleCategory,
  SourcingDatabaseSource,
} from "@prisma/client";

type InterviewerOption = {
  id: number;
  name: string;
  category: InterviewerCategory;
  availability: InterviewerAvailability;
};

export type SlaStatus = "NOT_STARTED" | "ACTIVE" | "OVERDUE" | "COMPLETED";

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
  sourcingDatabaseSource: SourcingDatabaseSource | null;
  sourcingAccessReceivedAt: Date | null;
  shortlistingDueAt: Date | null;
  shortlistingCompletedAt: Date | null;
  applicationCount: number;
  assignedInterviewerId: number | null;
  assignedInterviewer: InterviewerOption | null;
  interviewers: InterviewerOption[];
  clientCompletedAt: Date | null;
  isAdvancing?: boolean;
  isAssigning?: boolean;
  isRecordingAccess?: boolean;
  isCompletingShortlisting?: boolean;
  isPostingRequirement?: boolean;
  isNotifyingInterviewer?: boolean;
  onAdvanceLifecycle: (id: number, nextLifecycle: RequirementLifecycle) => void;
  onAssignInterviewer: (jobId: number, interviewerId: number | null) => void;
  onMarkAccessReceived: (jobId: number) => void;
  onCompleteShortlisting: (jobId: number) => void;
  onCompleteRequirement: (jobId: number) => void;
  onNotifyInterviewer: (jobId: number) => void;
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

const nextRequirementLifecycle: Partial<
  Record<RequirementLifecycle, RequirementLifecycle>
> = {
  REQUIREMENT_DRAFTED: "CLIENT_NOTIFIED",
  // CLIENT_NOTIFIED → REQUIREMENT_POSTED happens via completeJobRequirement
  // REQUIREMENT_POSTED → INTERVIEWER_NOTIFIED happens via notifyAssignedInterviewer
  // INTERVIEWER_NOTIFIED → SOURCING_SHORTLISTING happens via mark access received
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

const sourcingDatabaseLabels: Record<SourcingDatabaseSource, string> = {
  LINKEDIN: "LinkedIn",
  NAUKRI: "Naukri",
};

const slaStatusLabels: Record<SlaStatus, string> = {
  NOT_STARTED: "Not started",
  ACTIVE: "Active",
  OVERDUE: "Overdue",
  COMPLETED: "Completed",
};

export function formatJobDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "medium",
    hourCycle: "h23",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function getSourcingDatabaseLabel(
  source: SourcingDatabaseSource | null,
) {
  if (!source) return "Not configured";
  return sourcingDatabaseLabels[source];
}

export function getSlaStatus(params: {
  shortlistingCompletedAt: Date | null;
  shortlistingDueAt: Date | null;
  now?: Date;
}): SlaStatus {
  if (params.shortlistingCompletedAt) {
    return "COMPLETED";
  }

  if (!params.shortlistingDueAt) {
    return "NOT_STARTED";
  }

  const now = params.now ?? new Date();

  if (now.getTime() > new Date(params.shortlistingDueAt).getTime()) {
    return "OVERDUE";
  }

  return "ACTIVE";
}

export function getSourceTargetLabel(applicationCount: number) {
  if (applicationCount < 50) return "Below source target";
  if (applicationCount <= 100) return "Within source target";
  return "Above source target";
}

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
  sourcingDatabaseSource,
  sourcingAccessReceivedAt,
  shortlistingDueAt,
  shortlistingCompletedAt,
  applicationCount,
  assignedInterviewerId,
  assignedInterviewer,
  interviewers,
  clientCompletedAt,
  isAdvancing = false,
  isAssigning = false,
  isRecordingAccess = false,
  isCompletingShortlisting = false,
  isPostingRequirement = false,
  isNotifyingInterviewer = false,
  onAdvanceLifecycle,
  onAssignInterviewer,
  onMarkAccessReceived,
  onCompleteShortlisting,
  onCompleteRequirement,
  onNotifyInterviewer,
  onEdit,
  onDelete,
}: JobCardProps) {
  const nextLifecycle = nextRequirementLifecycle[requirementLifecycle];
  const isBillingBlocked = requirementLifecycle === "SOURCING_SHORTLISTING";
  const slaStatus = getSlaStatus({
    shortlistingCompletedAt,
    shortlistingDueAt,
  });
  const canCompleteRequirement = requirementLifecycle === "CLIENT_NOTIFIED";
  const canNotifyInterviewer =
    requirementLifecycle === "REQUIREMENT_POSTED" &&
    Boolean(assignedInterviewerId);
  const needsInterviewerAssignment =
    requirementLifecycle === "REQUIREMENT_POSTED" && !assignedInterviewerId;
  const canMarkAccessReceived =
    requirementLifecycle === "INTERVIEWER_NOTIFIED" &&
    Boolean(sourcingDatabaseSource);
  const canCompleteShortlisting =
    requirementLifecycle === "SOURCING_SHORTLISTING" &&
    Boolean(sourcingAccessReceivedAt) &&
    !shortlistingCompletedAt;

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
        {requirementLifecycle === "REQUIREMENT_POSTED" && (
          <div>
            <dt className="font-medium text-black">Requirement Posted</dt>
            <dd className="mt-1">Requirement Posted</dd>
          </div>
        )}
        {clientCompletedAt && (
          <div>
            <dt className="font-medium text-black">Client completed</dt>
            <dd className="mt-1">{formatJobDateTime(clientCompletedAt)}</dd>
          </div>
        )}
      </dl>

      <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-sm font-semibold text-black">Sourcing / SLA</p>
        <dl className="mt-3 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-black">Database</dt>
            <dd>{getSourcingDatabaseLabel(sourcingDatabaseSource)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Access</dt>
            <dd>
              {sourcingAccessReceivedAt ? "Received" : "Not received"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-black">SLA</dt>
            <dd>{slaStatusLabels[slaStatus]}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Profiles</dt>
            <dd>
              {applicationCount} ({getSourceTargetLabel(applicationCount)})
            </dd>
          </div>
          <div>
            <dt className="font-medium text-black">Target</dt>
            <dd>50–100</dd>
          </div>
          {shortlistingDueAt && (
            <div>
              <dt className="font-medium text-black">Due</dt>
              <dd>{formatJobDateTime(shortlistingDueAt)}</dd>
            </div>
          )}
          {shortlistingCompletedAt && (
            <div>
              <dt className="font-medium text-black">Completed</dt>
              <dd>{formatJobDateTime(shortlistingCompletedAt)}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="mt-6 rounded-lg bg-zinc-50 p-4">
        <label
          htmlFor={`job-${id}-interviewer`}
          className="block text-sm font-medium text-black"
        >
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
              {interviewer.name} —{" "}
              {interviewerCategoryLabels[interviewer.category]} —{" "}
              {availabilityLabels[interviewer.availability]}
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
              {isAdvancing
                ? "Moving..."
                : `Move to ${requirementLifecycleLabels[nextLifecycle]}`}
            </button>
          )}

          {canCompleteRequirement && (
            <button
              type="button"
              onClick={() => onCompleteRequirement(id)}
              disabled={isPostingRequirement}
              className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPostingRequirement ? "Posting..." : "Post Requirement"}
            </button>
          )}

          {requirementLifecycle === "REQUIREMENT_POSTED" && (
            <span className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
              Requirement Posted
            </span>
          )}

          {canNotifyInterviewer && (
            <button
              type="button"
              onClick={() => onNotifyInterviewer(id)}
              disabled={isNotifyingInterviewer}
              className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isNotifyingInterviewer ? "Notifying..." : "Notify Interviewer"}
            </button>
          )}

          {needsInterviewerAssignment && (
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
              Assign interviewer before notification
            </span>
          )}

          {requirementLifecycle === "INTERVIEWER_NOTIFIED" && (
            <span className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
              Interviewer Notified
            </span>
          )}

          {canMarkAccessReceived && (
            <button
              type="button"
              onClick={() => onMarkAccessReceived(id)}
              disabled={isRecordingAccess}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {isRecordingAccess
                ? "Recording..."
                : "Mark Database Access Received"}
            </button>
          )}

          {sourcingAccessReceivedAt &&
            requirementLifecycle === "SOURCING_SHORTLISTING" &&
            !canCompleteShortlisting &&
            shortlistingCompletedAt && (
              <span className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
                Shortlisting Completed
              </span>
            )}

          {canCompleteShortlisting && (
            <button
              type="button"
              onClick={() => onCompleteShortlisting(id)}
              disabled={isCompletingShortlisting}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {isCompletingShortlisting
                ? "Completing..."
                : "Complete Shortlisting"}
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

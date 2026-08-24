import type {
  InterviewerAvailability,
  InterviewerCategory,
  JobStatus,
  NotificationType,
  RequirementLifecycle,
} from "@prisma/client";
import Link from "next/link";

type NotificationCardProps = {
  type: NotificationType;
  message: string;
  createdAt: Date;
  emailDeliveredAt?: Date | null;
  jobTitle: string;
  jobStatus: JobStatus;
  requirementLifecycle: RequirementLifecycle;
  interviewerName: string | null;
  interviewerCategory: InterviewerCategory | null;
  interviewerAvailability: InterviewerAvailability | null;
  companyName?: string | null;
  workspaceHref?: string | null;
  workspaceLabel?: string | null;
  canRetry?: boolean;
  isRetrying?: boolean;
  onRetry?: (notificationId: number) => void;
  notificationId?: number;
};

const notificationTypeLabels: Record<NotificationType, string> = {
  INTERVIEWER_REQUIREMENT_READY: "Interviewer Requirement Ready",
  INTERVIEWER_DATABASE_READY: "Database Ready",
  CLIENT_SHORTLIST_READY: "Shortlist Ready",
  INTERVIEWER_INTERVIEW_BOOKED: "Interview Booked",
};

const requirementLifecycleLabels: Record<RequirementLifecycle, string> = {
  REQUIREMENT_POSTED: "Requirement Posted",
  INTERVIEWER_NOTIFIED: "Interviewer Notified",
  SOURCING_SHORTLISTING: "Sourcing & Shortlisting",
  BILLING_GENERATED: "Billing Generated",
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

function formatNotificationDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "medium",
    hourCycle: "h23",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export default function NotificationCard({
  type,
  message,
  createdAt,
  jobTitle,
  jobStatus,
  requirementLifecycle,
  interviewerName,
  interviewerCategory,
  interviewerAvailability,
  companyName,
  workspaceHref,
  workspaceLabel,
  emailDeliveredAt,
  canRetry = false,
  isRetrying = false,
  onRetry,
  notificationId,
}: NotificationCardProps) {
  const interviewerLabel =
    interviewerName && interviewerCategory && interviewerAvailability
      ? `${interviewerName} — ${interviewerCategoryLabels[interviewerCategory]} — ${availabilityLabels[interviewerAvailability]}`
      : "Client company";

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-black">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {notificationTypeLabels[type]}
          </p>
          <h3 className="mt-2 text-xl font-bold text-black">{message}</h3>
        </div>
        <div className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-black">
          {jobStatus}
        </div>
      </div>

      <dl className="mt-6 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
        <div>
          <dt className="font-medium text-black">Requirement</dt>
          <dd>{jobTitle}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Lifecycle</dt>
          <dd>{requirementLifecycleLabels[requirementLifecycle]}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">
            {type === "CLIENT_SHORTLIST_READY" ? "Client" : "Interviewer"}
          </dt>
          <dd>
            {type === "CLIENT_SHORTLIST_READY"
              ? companyName || "Client company"
              : interviewerLabel}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-black">Created</dt>
          <dd>{formatNotificationDateTime(createdAt)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Email</dt>
          <dd>
            {emailDeliveredAt
              ? `Delivered ${formatNotificationDateTime(emailDeliveredAt)}`
              : "Not delivered"}
          </dd>
        </div>
      </dl>
      <div className="mt-6 flex flex-wrap gap-3">
        {workspaceHref ? (
          <Link
            href={workspaceHref}
            className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {workspaceLabel ?? "Open requirement"}
          </Link>
        ) : null}
        {canRetry && !emailDeliveredAt && notificationId && onRetry ? (
          <button
            type="button"
            disabled={isRetrying}
            onClick={() => onRetry(notificationId)}
            className="inline-flex rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-100 disabled:opacity-60"
          >
            {isRetrying ? "Retrying..." : "Retry email"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

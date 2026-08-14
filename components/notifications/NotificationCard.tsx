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
  jobTitle: string;
  jobStatus: JobStatus;
  requirementLifecycle: RequirementLifecycle;
  interviewerName: string | null;
  interviewerCategory: InterviewerCategory | null;
  interviewerAvailability: InterviewerAvailability | null;
  companyName?: string | null;
  workspaceHref?: string | null;
  workspaceLabel?: string | null;
};

const notificationTypeLabels: Record<NotificationType, string> = {
  INTERVIEWER_REQUIREMENT_READY: "Interviewer Requirement Ready",
  INTERVIEWER_DATABASE_READY: "Database Ready",
  CLIENT_SHORTLIST_READY: "Shortlist Ready",
};

const requirementLifecycleLabels: Record<RequirementLifecycle, string> = {
  REQUIREMENT_DRAFTED: "Requirement Drafted",
  CLIENT_NOTIFIED: "Client Notified",
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
      </dl>
      {workspaceHref ? (
        <div className="mt-6">
          <Link
            href={workspaceHref}
            className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {workspaceLabel ?? "Open requirement"}
          </Link>
        </div>
      ) : null}
    </article>
  );
}

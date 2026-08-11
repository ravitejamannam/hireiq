import type {
  InterviewerAvailability,
  InterviewerCategory,
  JobStatus,
  NotificationType,
  RequirementLifecycle,
} from "@prisma/client";

type NotificationCardProps = {
  type: NotificationType;
  message: string;
  createdAt: Date;
  jobTitle: string;
  jobStatus: JobStatus;
  requirementLifecycle: RequirementLifecycle;
  interviewerName: string;
  interviewerCategory: InterviewerCategory;
  interviewerAvailability: InterviewerAvailability;
};

const notificationTypeLabels: Record<NotificationType, string> = {
  INTERVIEWER_REQUIREMENT_READY: "Interviewer Requirement Ready",
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
}: NotificationCardProps) {
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
          <dt className="font-medium text-black">Interviewer</dt>
          <dd>
            {interviewerName} — {interviewerCategoryLabels[interviewerCategory]}{" "}
            — {availabilityLabels[interviewerAvailability]}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-black">Created</dt>
          <dd>{formatNotificationDateTime(createdAt)}</dd>
        </div>
      </dl>
    </article>
  );
}

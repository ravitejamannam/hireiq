import Link from "next/link";
import type {
  InterviewerAvailability,
  InterviewerCategory,
  JobStatus,
  RequirementLifecycle,
} from "@prisma/client";

type AssignedJob = {
  id: number;
  title: string;
  status: JobStatus;
  requirementLifecycle: RequirementLifecycle;
};

type LoginStatus = "ACTIVE" | "DISABLED" | "PENDING_INVITE" | "NO_LOGIN";

type InterviewerCardProps = {
  id: number;
  name: string;
  category: InterviewerCategory;
  availability: InterviewerAvailability;
  assignedJobs: AssignedJob[];
  loginStatus: LoginStatus;
  loginEmail: string | null;
  pendingInvitationId: number | null;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onResendInvite: (id: number) => void;
  onRevokeInvite: (invitationId: number) => void;
  onSetLoginDisabled: (id: number, disabled: boolean) => void;
};

const categoryLabels: Record<InterviewerCategory, string> = {
  ENGINEERING: "Engineering",
  DATA_SCIENCE: "Data Science",
  PRODUCT: "Product",
  DESIGN: "Design",
};

const availabilityLabels: Record<InterviewerAvailability, string> = {
  AVAILABLE: "Available",
  NOT_AVAILABLE: "Not Available",
};

const availabilityClasses: Record<InterviewerAvailability, string> = {
  AVAILABLE: "bg-green-50 text-green-700",
  NOT_AVAILABLE: "bg-amber-50 text-amber-700",
};

const loginStatusLabels: Record<LoginStatus, string> = {
  ACTIVE: "Active login",
  DISABLED: "Login disabled",
  PENDING_INVITE: "Pending invite",
  NO_LOGIN: "No login",
};

const loginStatusClasses: Record<LoginStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-800",
  DISABLED: "bg-red-50 text-red-800",
  PENDING_INVITE: "bg-amber-50 text-amber-800",
  NO_LOGIN: "bg-zinc-100 text-zinc-700",
};

export default function InterviewerCard({
  id,
  name,
  category,
  availability,
  assignedJobs,
  loginStatus,
  loginEmail,
  pendingInvitationId,
  onEdit,
  onDelete,
  onResendInvite,
  onRevokeInvite,
  onSetLoginDisabled,
}: InterviewerCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-black">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Interviewer / Expert
          </p>
          <h3 className="mt-2 text-xl font-bold text-black">{name}</h3>
          <p className="mt-1 text-zinc-500">{categoryLabels[category]}</p>
          {loginEmail ? (
            <p className="mt-1 text-sm text-zinc-600">{loginEmail}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${availabilityClasses[availability]}`}
          >
            {availabilityLabels[availability]}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${loginStatusClasses[loginStatus]}`}
          >
            {loginStatusLabels[loginStatus]}
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-lg bg-zinc-50 p-4">
        <div className="text-sm font-medium text-black">Assigned Requirements</div>
        <div className="mt-1 text-3xl font-bold text-black">{assignedJobs.length}</div>
        {assignedJobs.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm text-zinc-600">
            {assignedJobs.slice(0, 3).map((job) => (
              <li key={job.id}>{job.title}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 border-t border-zinc-200 pt-4">
        <div className="flex flex-wrap justify-end gap-3">
          {loginStatus === "PENDING_INVITE" ? (
            <>
              <button
                type="button"
                onClick={() => onResendInvite(id)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-black hover:bg-zinc-100"
              >
                Resend invite
              </button>
              {pendingInvitationId ? (
                <button
                  type="button"
                  onClick={() => onRevokeInvite(pendingInvitationId)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-black hover:bg-zinc-100"
                >
                  Revoke invite
                </button>
              ) : null}
            </>
          ) : null}
          {loginStatus === "ACTIVE" ? (
            <button
              type="button"
              onClick={() => onSetLoginDisabled(id, true)}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-black hover:bg-zinc-100"
            >
              Disable login
            </button>
          ) : null}
          {loginStatus === "DISABLED" ? (
            <button
              type="button"
              onClick={() => onSetLoginDisabled(id, false)}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-black hover:bg-zinc-100"
            >
              Enable login
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onEdit(id)}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-black hover:bg-zinc-100"
          >
            Edit
          </button>
          <Link
            href={`/dashboard/interviewers/${id}`}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            View profile
          </Link>
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

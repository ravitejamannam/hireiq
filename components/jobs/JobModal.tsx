"use client";

import JobForm from "@/components/jobs/JobForm";
import type { JobFormData } from "@/components/jobs/JobForm";
import type { Company } from "@/types/company";
import type {
  InterviewerAvailability,
  InterviewerCategory,
} from "@prisma/client";

type AssignedInterviewerSummary = {
  id: number;
  name: string;
  category: InterviewerCategory;
  availability: InterviewerAvailability;
};

type JobModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (job: JobFormData) => void;
  companies: Company[];
  initialValues?: Parameters<typeof JobForm>[0]["initialValues"];
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

export default function JobModal({
  isOpen,
  onClose,
  onCreate,
  companies,
  initialValues,
  errorMessage,
  isSaving,
  isRecordingAccess,
  isCompletingShortlisting,
  isPostingRequirement,
  isNotifyingInterviewer,
  assignedInterviewer,
  onMarkAccessReceived,
  onCompleteShortlisting,
  onCompleteRequirement,
  onNotifyInterviewer,
}: JobModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Requirement / Post Role
            </p>
            <h2 className="mt-2 text-2xl font-bold text-black">
              {initialValues ? "Edit Requirement" : "Post a New Role"}
            </h2>
          </div>

          <button
            type="button"
            aria-label="Close requirement form"
            onClick={onClose}
            className="text-2xl text-zinc-500 hover:text-black"
          >
            ×
          </button>
        </div>

        <JobForm
          key={
            initialValues
              ? [
                  initialValues.requirementLifecycle,
                  initialValues.clientCompletedAt?.toString() ?? "not-completed",
                  initialValues.sourcingAccessReceivedAt?.toString() ?? "no-access",
                  initialValues.shortlistingCompletedAt?.toString() ??
                    "incomplete",
                  assignedInterviewer?.id?.toString() ?? "unassigned",
                ].join(":")
              : "create-job"
          }
          onCreate={onCreate}
          onCancel={onClose}
          companies={companies}
          initialValues={initialValues}
          errorMessage={errorMessage}
          isSaving={isSaving}
          isRecordingAccess={isRecordingAccess}
          isCompletingShortlisting={isCompletingShortlisting}
          isPostingRequirement={isPostingRequirement}
          isNotifyingInterviewer={isNotifyingInterviewer}
          assignedInterviewer={assignedInterviewer}
          onMarkAccessReceived={onMarkAccessReceived}
          onCompleteShortlisting={onCompleteShortlisting}
          onCompleteRequirement={onCompleteRequirement}
          onNotifyInterviewer={onNotifyInterviewer}
        />
      </div>
    </div>
  );
}

"use client";

import InterviewerForm from "@/components/interviewers/InterviewerForm";
import type { InterviewerFormData } from "@/components/interviewers/InterviewerForm";

type InterviewerModalProps = {
  isOpen: boolean;
  initialValues?: InterviewerFormData;
  errorMessage?: string;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (interviewer: InterviewerFormData) => void;
};

export default function InterviewerModal({
  isOpen,
  initialValues,
  errorMessage,
  isSaving,
  onClose,
  onSave,
}: InterviewerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Interviewer / Expert
            </p>
            <h2 className="mt-2 text-2xl font-bold text-black">
              {initialValues ? "Edit Interviewer" : "Add Interviewer"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close interviewer form"
            onClick={onClose}
            className="text-2xl text-zinc-500 hover:text-black"
          >
            ×
          </button>
        </div>

        <InterviewerForm
          initialValues={initialValues}
          errorMessage={errorMessage}
          isSaving={isSaving}
          onCancel={onClose}
          onSave={onSave}
        />
      </div>
    </div>
  );
}

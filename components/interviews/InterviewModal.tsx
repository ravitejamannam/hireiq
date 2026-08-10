"use client";

import InterviewForm from "@/components/interviews/InterviewForm";
import type { InterviewFormData } from "@/components/interviews/InterviewForm";
import type { getApplications } from "@/lib/repositories/application-repository";

type Application = Awaited<ReturnType<typeof getApplications>>[number];

type InterviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (interview: InterviewFormData) => void;
  applications: Application[];
  initialValues?: InterviewFormData;
};

export default function InterviewModal({
  isOpen,
  onClose,
  onCreate,
  applications,
  initialValues,
}: InterviewModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-black">
            {initialValues ? "Edit Interview" : "Add Interview"}
          </h2>

          <button
            onClick={onClose}
            className="text-2xl text-zinc-500 hover:text-black"
          >
            ×
          </button>
        </div>

        <InterviewForm
          onCreate={onCreate}
          onCancel={onClose}
          applications={applications}
          initialValues={initialValues}
        />
      </div>
    </div>
  );
}
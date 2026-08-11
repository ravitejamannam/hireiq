"use client";

import ApplicationForm from "@/components/applications/ApplicationForm";
import type {
  ApplicationCandidateOption,
  ApplicationFormData,
} from "@/components/applications/ApplicationForm";
import type { getJobs } from "@/lib/repositories/job-repository";

type Job = Awaited<ReturnType<typeof getJobs>>[number];

type ApplicationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (application: ApplicationFormData) => void;
  candidates: ApplicationCandidateOption[];
  jobs: Job[];
  initialValues?: ApplicationFormData;
  errorMessage?: string;
};

export default function ApplicationModal({
  isOpen,
  onClose,
  onCreate,
  candidates,
  jobs,
  initialValues,
  errorMessage,
}: ApplicationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-black">
            {initialValues ? "Edit Application" : "Add Application"}
          </h2>

          <button
            type="button"
            aria-label="Close application modal"
            onClick={onClose}
            className="text-2xl text-zinc-500 hover:text-black"
          >
            ×
          </button>
        </div>

        {errorMessage && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <ApplicationForm
          onCreate={onCreate}
          onCancel={onClose}
          candidates={candidates}
          jobs={jobs}
          initialValues={initialValues}
        />
      </div>
    </div>
  );
}

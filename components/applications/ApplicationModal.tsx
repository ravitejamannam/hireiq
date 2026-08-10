"use client";

import ApplicationForm from "@/components/applications/ApplicationForm";
import type { ApplicationFormData } from "@/components/applications/ApplicationForm";
import type { getCandidates } from "@/lib/repositories/candidate-repository";
import type { getJobs } from "@/lib/repositories/job-repository";

type Candidate = Awaited<ReturnType<typeof getCandidates>>[number];
type Job = Awaited<ReturnType<typeof getJobs>>[number];

type ApplicationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (application: ApplicationFormData) => void;
  candidates: Candidate[];
  jobs: Job[];
  initialValues?: ApplicationFormData;
};

export default function ApplicationModal({
  isOpen,
  onClose,
  onCreate,
  candidates,
  jobs,
  initialValues,
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
            onClick={onClose}
            className="text-2xl text-zinc-500 hover:text-black"
          >
            ×
          </button>
        </div>

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

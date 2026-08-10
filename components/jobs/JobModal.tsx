"use client";

import JobForm from "@/components/jobs/JobForm";
import type { JobFormData } from "@/components/jobs/JobForm";
import type { Company } from "@/types/company";

type JobModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (job: JobFormData) => void;
  companies: Company[];
  initialValues?: JobFormData;
};

export default function JobModal({
  isOpen,
  onClose,
  onCreate,
  companies,
  initialValues,
}: JobModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-black">
            {initialValues ? "Edit Job" : "Add Job"}
          </h2>

          <button
            onClick={onClose}
            className="text-2xl text-zinc-500 hover:text-black"
          >
            ×
          </button>
        </div>

        <JobForm
          onCreate={onCreate}
          onCancel={onClose}
          companies={companies}
          initialValues={initialValues}
        />
      </div>
    </div>
  );
}

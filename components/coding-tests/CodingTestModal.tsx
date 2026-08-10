"use client";

import CodingTestForm from "@/components/coding-tests/CodingTestForm";
import type { CodingTestFormData } from "@/components/coding-tests/CodingTestForm";
import type { getApplications } from "@/lib/repositories/application-repository";

type Application = Awaited<ReturnType<typeof getApplications>>[number];

type CodingTestModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (codingTest: CodingTestFormData) => void;
  applications: Application[];
  initialValues?: CodingTestFormData;
};

export default function CodingTestModal({
  isOpen,
  onClose,
  onCreate,
  applications,
  initialValues,
}: CodingTestModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-black">
            {initialValues ? "Edit Coding Test" : "Add Coding Test"}
          </h2>

          <button
            onClick={onClose}
            className="text-2xl text-zinc-500 hover:text-black"
          >
            ×
          </button>
        </div>

        <CodingTestForm
          onCreate={onCreate}
          onCancel={onClose}
          applications={applications}
          initialValues={initialValues}
        />
      </div>
    </div>
  );
}
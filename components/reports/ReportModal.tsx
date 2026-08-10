"use client";

import ReportForm from "@/components/reports/ReportForm";
import type { ReportFormData } from "@/components/reports/ReportForm";
import type { getApplications } from "@/lib/repositories/application-repository";

type Application = Awaited<ReturnType<typeof getApplications>>[number];

type ReportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (report: ReportFormData) => void;
  applications: Application[];
  initialValues?: ReportFormData;
};

export default function ReportModal({
  isOpen,
  onClose,
  onCreate,
  applications,
  initialValues,
}: ReportModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-black">
            {initialValues ? "Edit Report" : "Add Report"}
          </h2>

          <button
            onClick={onClose}
            className="text-2xl text-zinc-500 hover:text-black"
          >
            ×
          </button>
        </div>

        <ReportForm
          onCreate={onCreate}
          onCancel={onClose}
          applications={applications}
          initialValues={initialValues}
        />
      </div>
    </div>
  );
}

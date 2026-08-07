"use client";

import CandidateForm from "@/components/candidates/CandidateForm";
import type { CandidateStatus } from "@prisma/client";
import type { Company } from "@/types/company";

type CandidateFormData = {
  name: string;
  role: string;
  experienceYears: number;
  status: CandidateStatus;
  companyId: number;
};

type CandidateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (candidate: CandidateFormData) => void;
  companies: Company[];
  initialValues?: CandidateFormData;
};

export default function CandidateModal({
  isOpen,
  onClose,
  onCreate,
  companies,
  initialValues,
}: CandidateModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-black">
            Add Candidate
          </h2>

          <button
            onClick={onClose}
            className="text-2xl text-zinc-500 hover:text-black"
          >
            ×
          </button>
        </div>

        <CandidateForm onCreate={onCreate} onCancel={onClose} companies={companies} initialValues={initialValues} />
      </div>
    </div>
  );
}
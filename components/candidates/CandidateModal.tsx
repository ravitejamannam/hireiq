"use client";

import CandidateForm from "@/components/candidates/CandidateForm";

type CandidateFormData = {
  name: string;
  role: string;
  experience: string;
  status: string;
};

type CandidateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (candidate: CandidateFormData) => void;
};

export default function CandidateModal({
  isOpen,
  onClose,
  onCreate,
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

        <CandidateForm onCreate={onCreate} onCancel={onClose}  />
      </div>
    </div>
  );
}
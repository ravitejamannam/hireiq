"use client";

import CompanyForm from "@/components/companies/CompanyForm";

type CompanyFormData = {
  name: string;
  industry: string;
  employees: number;
};



type CompanyModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (company: CompanyFormData) => void;
  initialValues?: CompanyFormData;
};

export default function CompanyModal({
  isOpen,
  onClose,
  onCreate,
  initialValues,
}: CompanyModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-black">
            Add Company
          </h2>

          <button
            onClick={onClose}
            className="text-2xl text-zinc-500 hover:text-black"
          >
            ×
          </button>
        </div>

        <CompanyForm onCreate={onCreate} onCancel={onClose} initialValues={initialValues} />
      </div>
    </div>
  );
}
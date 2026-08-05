"use client";

import CodingTestForm from "./CodingTestForm";

type CodingTestModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function CodingTestModal({
  isOpen,
  onClose,
}: CodingTestModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-black">
            Add Coding Test
          </h2>

          <button
            onClick={onClose}
            className="text-2xl text-zinc-500 hover:text-black"
          >
            ×
          </button>
        </div>

        <CodingTestForm onCancel={onClose} />
      </div>
    </div>
  );
}
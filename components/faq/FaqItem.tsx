"use client";

import { useState } from "react";

type FaqItemProps = {
  question: string;
  answer: string;
};

export default function FaqItem({
  question,
  answer,
}: FaqItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        className="flex w-full items-center justify-between p-5 text-left font-medium"
      >
        <span className="text-lg font-medium text-slate-900">{question}</span>

        <span className="text-2xl font-semibold text-slate-500">{isOpen ? "−" : "+"}</span>
      </button>

      {isOpen && (
        <div className="border-t border-slate-200 p-6 leading-7 text-slate-600">
          {answer}
        </div>
      )}
    </div>
  );
}
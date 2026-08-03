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
    <div className="rounded-lg border border-slate-200">
      <button
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        className="flex w-full items-center justify-between p-5 text-left font-medium"
      >
        <span>{question}</span>

        <span>{isOpen ? "−" : "+"}</span>
      </button>

      {isOpen && (
        <div className="border-t border-slate-200 p-5 text-slate-600">
          {answer}
        </div>
      )}
    </div>
  );
}
"use client";

import { useId, useState } from "react";

type FaqItemProps = {
  question: string;
  answer: string;
};

export default function FaqItem({
  question,
  answer,
}: FaqItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonId = useId();
  const answerId = useId();

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white transition-all duration-300">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={answerId}
        id={buttonId}
        className="flex w-full items-center justify-between p-6 text-left"
      >
        <span className="text-lg font-semibold text-zinc-900">
          {question}
        </span>

        <span className="text-2xl font-light text-zinc-500">
          {isOpen ? "−" : "+"}
        </span>
      </button>

      {isOpen && (
        <div
          id={answerId}
          role="region"
          aria-labelledby={buttonId}
          className="border-t border-zinc-200 px-6 pb-6 pt-5 leading-7 text-zinc-600"
        >
          {answer}
        </div>
      )}
    </div>
  );
}
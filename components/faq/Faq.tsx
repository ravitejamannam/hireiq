import SectionHeading from "@/components/ui/SectionHeading";
import FaqItem from "./FaqItem";

const faqs = [
  {
    question: "Why not use AI interviews?",
    answer:
      "AI is great at checking syntax, but engineering judgment still requires experienced developers.",
  },
  {
    question: "How are experts selected?",
    answer:
      "Every expert is vetted through technical interviews and real engineering experience.",
  },
  {
    question: "How long does an interview take?",
    answer:
      "Most interviews take between 60 and 90 minutes.",
  },
];

export default function Faq() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <SectionHeading
        eyebrow="FAQ"
        title="Frequently Asked Questions"
        description="Everything you need to know before using HireIQ."
      />

      <div className="mt-12 space-y-4">
        {faqs.map((faq) => (
          <FaqItem
            key={faq.question}
            question={faq.question}
            answer={faq.answer}
          />
        ))}
      </div>
    </section>
  );
}
import SectionHeading from "@/components/ui/SectionHeading";
import FaqItem from "./FaqItem";

const faqs = [
  {
    question: "How is HireIQ different from an ATS like Greenhouse or Workable?",
    answer:
      "Traditional ATS tools track applicants. HireIQ proves things — every candidate fact links to a source artifact, rankings are explainable evidence coverage, and the whole decision trail is immutable. It's the difference between a filing cabinet and a lab notebook.",
  },
  {
    question: "Do you use AI to score or reject candidates?",
    answer:
      "No — and that's architectural, not a policy setting. AI drafts job descriptions and extracts claims from resumes, always labeled and traceable. Scoring assessments is deterministic against answer keys. Shortlist decisions are always human.",
  },
  {
    question: "How do candidates benefit?",
    answer:
      "They see their assessment score, their live pipeline status, and where they stand on a public leaderboard for the role. No application disappears into a void — and rejections come with real communication.",
  },
  {
    question: "Can agencies use this with their clients?",
    answer:
      "Yes. Clients get their own portal with transparent shortlists and billing math shown openly (compensation × markup = fee). No hidden numbers between you and your client.",
  },
  {
    question: "Does it integrate with job boards?",
    answer:
      "Publishing generates hosted apply pages, Google Jobs structured data, an XML feed for aggregators, an embeddable widget for your careers site, and a REST API with webhooks — all from one click.",
  },
];

export default function Faq() {
  return (
    <section id="faq" className="border-t border-stone-200/70 bg-white">
      <div className="mx-auto max-w-4xl px-6 py-24">
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
      </div>
    </section>
  );
}
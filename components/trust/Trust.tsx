import SectionHeading from "@/components/ui/SectionHeading";
import TrustCard from "./TrustCard";

const trustItems = [
  {
    title: "Real Senior Engineers",
    description:
      "Candidates are evaluated by experienced engineers instead of automated filters.",
  },
  {
    title: "Structured Evaluations",
    description:
      "Every interview follows a consistent rubric, making hiring decisions fair and repeatable.",
  },
  {
    title: "Faster Hiring",
    description:
      "Reduce engineering interview time while maintaining high technical standards.",
  },
  {
    title: "Better Candidate Experience",
    description:
      "Candidates receive a professional interview process with meaningful technical feedback.",
  },
];

export default function Trust() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <SectionHeading
        eyebrow="Why HireIQ"
        title="Built for modern engineering teams"
        description="Technical hiring should be accurate, fast, and consistent."
      />

      <div className="mt-16 grid gap-6 md:grid-cols-2">
        {trustItems.map((item) => (
          <TrustCard
            key={item.title}
            title={item.title}
            description={item.description}
          />
        ))}
      </div>
    </section>
  );
}
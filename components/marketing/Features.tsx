import FeatureCard from "@/components/marketing/FeatureCard";
import SectionHeading from "@/components/ui/SectionHeading";

const features = [
  {
    title: "Expert-Led Technical Interviews",
    description:
      "Experienced software engineers evaluate candidates through structured technical interviews instead of relying only on automated assessments.",
  },
  {
    title: "Structured Engineering Evaluations",
    description:
      "Every interview follows a consistent evaluation framework with detailed feedback, scorecards, and hiring recommendations.",
  },
  {
    title: "Hiring Intelligence",
    description:
      "Compare candidates, review interview insights, and make confident hiring decisions backed by real engineering expertise.",
  },
];

export default function Features() {
  return (
    <section id="features" className="bg-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeading
          theme="dark"
          eyebrow="Why HireIQ"
          title="Everything your engineering team needs to hire with confidence."
          description="From expert-led interviews to structured technical evaluations, HireIQ helps engineering teams identify exceptional talent faster and more consistently."
        />

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard
              key={feature.title}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

import FeatureCard from "@/components/home/FeatureCard";
import SectionHeading from "@/components/ui/SectionHeading";

const features = [
  {
    title: "AI Resume Screening",
    description:
      "Automatically evaluate resumes and identify the strongest candidates.",
  },
  {
    title: "Live Coding Interviews",
    description:
      "Conduct coding interviews with real-time collaboration and feedback.",
  },
  {
    title: "Candidate Analytics",
    description:
      "Track interview performance and compare candidates with actionable insights.",
  },
];

export default function Features() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <SectionHeading
        eyebrow="Features"
        title="Everything you need to hire with confidence"
        description="From resume screening to expert evaluations, HireIQ helps your team make faster and better hiring decisions."
      />
      <div className="mt-16 grid gap-6 md:grid-cols-3">
        {features.map((feature) => (
          <FeatureCard
            key={feature.title}
            title={feature.title}
            description={feature.description}
          />
        ))}
      </div>
    </section>
  );
}

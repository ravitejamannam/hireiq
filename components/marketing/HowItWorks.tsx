import SectionHeading from "@/components/ui/SectionHeading";
import ProcessStep from "@/components/marketing/ProcessStep";

const steps = [
  { step: "01", title: "Post a Role", description: "..." },
  { step: "02", title: "Experts Screen Profiles", description: "..." },
  { step: "03", title: "Technical Evaluation", description: "..." },
  { step: "04", title: "Shortlist Candidates", description: "..." },
  { step: "05", title: "Hire with Confidence", description: "..." },
];

export default function HowItWorks() {
  return (
    <section className="bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeading
          eyebrow="Process"
          title="How HireIQ Works"
          description="A simple hiring workflow that helps companies identify and hire the right engineers."
        />
        <div className="mt-16 grid gap-6 md:grid-cols-5">
          {steps.map((step) => (
            <ProcessStep
              key={step.step}
              step={step.step}
              title={step.title}
              description={step.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

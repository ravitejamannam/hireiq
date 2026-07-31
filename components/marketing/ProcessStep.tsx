type ProcessStepProps = {
  step: string;
  title: string;
  description: string;
};

export default function ProcessStep({
  step,
  title,
  description,
}: ProcessStepProps) {
  return (
    <div className="rounded-xl border border-slate-200 p-6">
      <p className="text-sm font-semibold text-blue-600">Step {step}</p>

      <h3 className="mt-2 text-xl font-semibold">{title}</h3>

      <p className="mt-3 text-slate-600">{description}</p>
    </div>
  );
}

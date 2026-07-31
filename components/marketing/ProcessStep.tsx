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
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white font-bold">
        {step}
      </div>

      <h3 className="mt-2 text-xl font-semibold">{title}</h3>

      <p className="mt-3 text-slate-600">{description}</p>
    </div>
  );
}

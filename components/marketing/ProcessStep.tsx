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
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-lg font-bold text-white">
        {step}
      </div>

      <h3 className="mt-4 text-xl font-semibold text-slate-900">{title}</h3>

      <p className="mt-2 leading-7 text-slate-600">{description}</p>
    </div>
  );
}

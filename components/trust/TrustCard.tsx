type TrustCardProps = {
  title: string;
  description: string;
};

export default function TrustCard({
  title,
  description,
}: TrustCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 p-6">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
        ✓
      </div>

      <h3 className="text-xl font-semibold">
        {title}
      </h3>

      <p className="mt-3 text-slate-600">
        {description}
      </p>
    </article>
  );
}
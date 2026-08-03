type FeatureCardProps = {
  title: string;
  description: string;
};

export default function FeatureCard({
  title,
  description,
}: FeatureCardProps) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-black text-lg font-bold text-white">
        ✓
      </div>

      <h3 className="text-2xl font-semibold text-zinc-900">
        {title}
      </h3>

      <p className="mt-4 leading-7 text-zinc-600">
        {description}
      </p>
    </article>
  );
}
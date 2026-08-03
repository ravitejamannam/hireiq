type FeatureCardProps = {
  title: string;
  description: string;
};

export default function FeatureCard({ title, description }: FeatureCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 p-6 shadow-sm transition-shadow duration-300 hover:shadow-md">
      <h3 className="text-xl font-semibold">{title}</h3>

      <p className="mt-3 text-slate-600">{description}</p>
    </article>
  );
}

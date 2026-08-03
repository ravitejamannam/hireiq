type TrustCardProps = {
  title: string;
  description: string;
};

export default function TrustCard({
  title,
  description,
}: TrustCardProps) {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-zinc-700 hover:shadow-xl">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-black text-lg font-bold text-white">
        ✓
      </div>

      <h3 className="text-2xl font-semibold text-white">
        {title}
      </h3>

      <p className="mt-4 leading-7 text-zinc-400">
        {description}
      </p>
    </article>
  );
}
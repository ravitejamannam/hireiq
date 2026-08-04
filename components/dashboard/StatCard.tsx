type StatCardProps = {
  title: string;
  value: number | string;
};

export default function StatCard({
  title,
  value,
}: StatCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6">
      <p className="text-sm font-medium text-zinc-500">
        {title}
      </p>

      <h2 className="mt-3 text-4xl font-bold text-black">
        {value}
      </h2>
    </article>
  );
}
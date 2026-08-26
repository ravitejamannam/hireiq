type StatCardProps = {
  title: string;
  value: number | string;
};

export default function StatCard({
  title,
  value,
}: StatCardProps) {
  return (
    <article className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-stone-200/50">
      <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">
        {title}
      </p>
      <h2 className="mt-2 text-3xl font-black tracking-tight text-stone-900 tabular-nums">
        {value}
      </h2>
    </article>
  );
}

import Link from "next/link";

export type WorkQueueItem = {
  href: string;
  title: string;
  meta: string;
  urgency?: "now" | "next";
};

export default function WorkQueue({
  title,
  items,
  empty,
}: {
  title: string;
  items: WorkQueueItem[];
  empty: string;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">
            Needs you
          </p>
          <h2 className="mt-1 text-xl font-bold text-stone-900">{title}</h2>
        </div>
        <p className="text-sm tabular-nums text-stone-500">
          {items.length === 0 ? "Clear" : `${items.length} open`}
        </p>
      </div>

      {items.length === 0 ? (
        <p className="mt-5 text-sm leading-relaxed text-stone-600">{empty}</p>
      ) : (
        <ul className="mt-5 divide-y divide-stone-100">
          {items.map((item) => (
            <li key={`${item.href}-${item.title}`}>
              <Link
                href={item.href}
                className="flex items-start justify-between gap-4 py-3.5 transition hover:bg-stone-50/80"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-sm text-stone-500">{item.meta}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    item.urgency === "now"
                      ? "bg-rose-100 text-rose-800"
                      : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {item.urgency === "now" ? "Now" : "Next"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

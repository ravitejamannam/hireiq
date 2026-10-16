"use client";

import type { HiringFunnelReport } from "@/lib/hiring/funnel";

const FUNNEL_COLORS = [
  "bg-stone-800",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-teal-500",
  "bg-emerald-500",
  "bg-zinc-700",
];

function fmtDays(days: number | null) {
  if (days === null) return "—";
  return `${days} days`;
}

export function HiringFunnelBars({
  funnel,
}: {
  funnel: Array<{ key: string; label: string; count: number }>;
}) {
  const maxFunnel = Math.max(...funnel.map((stage) => stage.count), 1);

  return (
    <div className="space-y-3">
      {funnel.map((stage, i) => {
        const width = Math.max(4, Math.round((stage.count / maxFunnel) * 100));
        const prev = i > 0 ? funnel[i - 1].count : null;
        const conversion =
          prev !== null && prev > 0
            ? Math.round((stage.count / prev) * 100)
            : null;
        return (
          <div key={stage.key} className="flex items-center gap-4">
            <span className="w-40 shrink-0 text-right text-sm font-medium text-zinc-600">
              {stage.label}
            </span>
            <div className="h-7 flex-1 overflow-hidden rounded-lg bg-zinc-100">
              <div
                className={`flex h-full items-center rounded-lg px-3 ${FUNNEL_COLORS[i % FUNNEL_COLORS.length]}`}
                style={{ width: `${width}%` }}
              >
                <span className="text-xs font-bold text-white">{stage.count}</span>
              </div>
            </div>
            {conversion !== null ? (
              <span className="w-16 shrink-0 text-xs text-zinc-400">
                {conversion}%
              </span>
            ) : (
              <span className="w-16" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function HiringFunnelPanel({
  report,
  title = "Hiring funnel",
}: {
  report: Pick<
    HiringFunnelReport,
    "funnel" | "sources" | "timeToHireLabel" | "timeToShortlistDays" | "totals"
  >;
  title?: string;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <article className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-500">Applications</p>
          <p className="mt-2 text-3xl font-bold text-zinc-900">
            {report.totals.applications}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-500">Active</p>
          <p className="mt-2 text-3xl font-bold text-indigo-600">
            {report.totals.active}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-500">Time to shortlist</p>
          <p className="mt-2 text-3xl font-bold text-zinc-900">
            {fmtDays(report.timeToShortlistDays)}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-500">Time to hire</p>
          <p className="mt-2 text-3xl font-bold text-zinc-900">
            {report.timeToHireLabel}
          </p>
        </article>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900">{title}</h2>
        <p className="mt-0.5 text-xs text-zinc-400">
          Counts of applications that reached each event. Assessment score is
          not a hire decision. Time to hire uses the HIRED outcome, not offer
          acceptance or the last edit.
        </p>
        <div className="mt-5">
          <HiringFunnelBars funnel={report.funnel} />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900">Source</h2>
        <p className="mt-0.5 text-xs text-zinc-400">
          Ingestion channel (hosted apply, boards, referral, manual) — not the
          LinkedIn/Naukri sourcing-database field.
        </p>
        {report.sources.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No applications yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {report.sources.map((s) => (
              <li
                key={s.source}
                className="flex items-center justify-between rounded-lg border border-zinc-100 px-4 py-2.5"
              >
                <span className="text-sm font-medium text-zinc-800">
                  {s.source}
                </span>
                <span className="text-sm text-zinc-600">
                  {s.count} applications
                  {s.hires > 0 ? (
                    <span className="ml-2 font-medium text-emerald-600">
                      · {s.hires} hired
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

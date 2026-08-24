import Link from "next/link";

import { requireAdmin } from "@/lib/auth/authorization";
import { getAnalyticsReport } from "@/lib/analytics/analytics-service";

export const dynamic = "force-dynamic";

const FUNNEL_COLORS = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-sky-500",
  "bg-cyan-500",
  "bg-teal-500",
  "bg-emerald-500",
];

function fmtDays(days: number | null) {
  if (days === null) return "—";
  return `${days} days`;
}

export default async function AnalyticsPage() {
  await requireAdmin();
  const report = await getAnalyticsReport();

  const maxFunnel = Math.max(...report.funnel.map((f) => f.count), 1);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Hiring analytics
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Funnel health across every requirement. Read-only — analytics never
          mutates source data.
        </p>
      </header>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <article className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-500">Total applications</p>
          <p className="mt-2 text-3xl font-bold text-zinc-900">
            {report.totals.applications}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-500">Active in pipeline</p>
          <p className="mt-2 text-3xl font-bold text-indigo-600">
            {report.totals.active}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-500">Hired</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">
            {report.totals.hired}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-500">Avg time to hire</p>
          <p className="mt-2 text-3xl font-bold text-zinc-900">
            {fmtDays(report.timeToHireDays)}
          </p>
        </article>
      </div>

      {/* Funnel */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900">Pipeline funnel</h2>
        <p className="mt-0.5 text-xs text-zinc-400">
          Cumulative — how many applications reached each stage (current or
          past).
        </p>
        <div className="mt-5 space-y-3">
          {report.funnel.map((stage, i) => {
            const width = Math.max(
              4,
              Math.round((stage.count / maxFunnel) * 100),
            );
            const prev = i > 0 ? report.funnel[i - 1].count : null;
            const conversion =
              prev !== null && prev > 0
                ? Math.round((stage.count / prev) * 100)
                : null;
            return (
              <div key={stage.status} className="flex items-center gap-4">
                <span className="w-32 shrink-0 text-right text-sm font-medium text-zinc-600">
                  {stage.label}
                </span>
                <div className="h-7 flex-1 overflow-hidden rounded-lg bg-zinc-100">
                  <div
                    className={`flex h-full items-center rounded-lg px-3 ${FUNNEL_COLORS[i % FUNNEL_COLORS.length]}`}
                    style={{ width: `${width}%` }}
                  >
                    <span className="text-xs font-bold text-white">
                      {stage.count}
                    </span>
                  </div>
                </div>
                {conversion !== null ? (
                  <span className="w-16 shrink-0 text-xs text-zinc-400">
                    {conversion}% pass
                  </span>
                ) : (
                  <span className="w-16" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sources */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="font-semibold text-zinc-900">Source performance</h2>
          {report.sources.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No sourced applications yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {report.sources.map((s) => (
                <li
                  key={s.source}
                  className="flex items-center justify-between rounded-lg border border-zinc-100 px-4 py-2.5"
                >
                  <span className="text-sm font-medium text-zinc-800">{s.source}</span>
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

        {/* Per requirement */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="font-semibold text-zinc-900">By requirement</h2>
          <ul className="mt-4 space-y-3">
            {report.perRequirement.map((r) => (
              <li key={r.jobId}>
                <Link
                  href={`/dashboard/requirements/${r.jobId}`}
                  className="block rounded-lg border border-zinc-100 px-4 py-3 transition hover:border-zinc-300"
                >
                  <p className="text-sm font-medium text-zinc-800">{r.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {r.total} total ·{" "}
                    <span className="text-emerald-600">{r.hired} hired</span> ·{" "}
                    {r.active} active
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

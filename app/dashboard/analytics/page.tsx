import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analytics",
};

import Link from "next/link";

import { requireAdmin } from "@/lib/auth/authorization";
import { getAnalyticsReport } from "@/lib/analytics/analytics-service";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import HiringFunnelPanel, { HiringFunnelBars } from "@/components/hiring/HiringFunnelPanel";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  await requireAdmin();
  const report = await getAnalyticsReport();

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Hiring analytics
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Funnel health across every requirement. Read-only — analytics never
            mutates source data, and assessment score is not a hire decision.
          </p>
        </header>

        <HiringFunnelPanel report={report} />

        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="font-semibold text-zinc-900">Pipeline stages</h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            Operational pipeline — cumulative current-or-past stage, separate
            from the hiring events above.
          </p>
          <div className="mt-5">
            <HiringFunnelBars
              funnel={report.pipelineFunnel.map((stage) => ({
                key: stage.status,
                label: stage.label,
                count: stage.count,
              }))}
            />
          </div>
        </section>

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
    </DashboardLayout>
  );
}

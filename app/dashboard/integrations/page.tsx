import Link from "next/link";

import StatCard from "@/components/dashboard/StatCard";
import { requireAdmin } from "@/lib/auth/authorization";
import { getWebhookDeliveryHealth, listWebhookDeliveries } from "@/lib/jobs/distribution/webhook-delivery-admin";
import RunReconciliationButton from "@/components/integrations/RunReconciliationButton";
import { getLatestReconciliationHealth } from "@/lib/jobs/distribution/reconciliation";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  ACCEPTED:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  QUARANTINED:
    "bg-amber-50 text-amber-700 ring-amber-600/20",
  REJECTED:
    "bg-red-50 text-red-700 ring-red-600/20",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status] ?? "bg-zinc-50 text-zinc-700 ring-zinc-600/20"}`}
    >
      {status}
    </span>
  );
}

type PageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default async function IntegrationsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const { status } = await searchParams;

  const [health, deliveries, recon] = await Promise.all([
    getWebhookDeliveryHealth(),
    listWebhookDeliveries(status ? { status } : {}),
    getLatestReconciliationHealth(),
  ]);

  const tabs = [
    { label: "All", value: "" },
    { label: "Quarantined", value: "QUARANTINED" },
    { label: "Accepted", value: "ACCEPTED" },
    { label: "Rejected", value: "REJECTED" },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Integrations</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Health of provider webhooks. Quarantined deliveries hold real
          applicants waiting for triage — replay them after fixing parsers.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Accepted" value={health.accepted} />
        <StatCard
          title="Quarantined"
          value={health.quarantined}
        />
        <StatCard title="Rejected" value={health.rejected} />
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-zinc-900">Board reconciliation</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Compares published roles against what boards report. Detection
              only — drift never silently changes distribution state.
            </p>
          </div>
          <RunReconciliationButton />
        </div>

        {recon.lastRunAt ? (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg bg-emerald-50 p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{recon.counts.ok}</p>
              <p className="text-xs font-medium text-emerald-600">OK</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3 text-center">
              <p className="text-2xl font-bold text-amber-700">{recon.counts.drift}</p>
              <p className="text-xs font-medium text-amber-600">Drift</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{recon.counts.error}</p>
              <p className="text-xs font-medium text-red-600">Error</p>
            </div>
            <div className="rounded-lg bg-zinc-100 p-3 text-center">
              <p className="text-2xl font-bold text-zinc-700">{recon.counts.skipped}</p>
              <p className="text-xs font-medium text-zinc-500">Skipped</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">No sweep has run yet.</p>
        )}
        {recon.lastRunAt ? (
          <p className="mt-3 text-xs text-zinc-400">
            Last run: {new Date(recon.lastRunAt).toLocaleString()}
          </p>
        ) : null}

        {recon.recentFindings.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {recon.recentFindings.slice(0, 5).map((f) => (
              <li key={f.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                <span className="font-medium text-amber-900">{f.provider}</span>{" "}
                <span className="text-amber-800">
                  dist #{f.distributionId} — {f.finding ?? f.outcome}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="flex gap-2">
        {tabs.map((tab) => {
          const active = (status ?? "") === tab.value;
          return (
            <Link
              key={tab.label}
              href={tab.value ? `/dashboard/integrations?status=${tab.value}` : "/dashboard/integrations"}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {deliveries.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500">
            No webhook deliveries{status ? ` with status ${status}` : ""} yet.
          </p>
        ) : (
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50">
              <tr>
                {["Provider", "Status", "External event", "Received", "Error"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left font-medium text-zinc-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {deliveries.map((d) => (
                <tr key={d.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">{d.provider}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                    {d.externalEventId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {new Date(d.receivedAt).toLocaleString()}
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-zinc-500">
                    {d.errorCode ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/integrations/${d.id}`}
                      className="font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

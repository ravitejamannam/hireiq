import Link from "next/link";
import { notFound } from "next/navigation";

import ReplayButton from "@/components/integrations/ReplayButton";
import { requireAdmin } from "@/lib/auth/authorization";
import { getWebhookDeliveryForAdmin } from "@/lib/jobs/distribution/webhook-delivery-admin";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-sm font-medium text-zinc-500">{label}</dt>
      <dd className="text-right text-sm text-zinc-900">{children}</dd>
    </div>
  );
}

export default async function WebhookDeliveryDetailPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;

  if (!/^\d+$/.test(id)) notFound();
  const delivery = await getWebhookDeliveryForAdmin(id).catch(() => null);
  if (!delivery) notFound();

  return (
    <DashboardLayout>
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/integrations"
            className="text-sm text-indigo-600 hover:text-indigo-500"
          >
            ← Integrations
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">
            {delivery.provider} delivery #{delivery.id}
          </h1>
        </div>
        <span
          className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
            delivery.status === "ACCEPTED"
              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
              : delivery.status === "QUARANTINED"
                ? "bg-amber-50 text-amber-700 ring-amber-600/20"
                : "bg-red-50 text-red-700 ring-red-600/20"
          }`}
        >
          {delivery.status}
        </span>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white px-6 py-4">
        <dl className="divide-y divide-zinc-100">
          <Row label="External event ID">
            <span className="font-mono text-xs">{delivery.externalEventId ?? "—"}</span>
          </Row>
          <Row label="Signature valid">
            {delivery.signatureValid ? "✅ Yes" : "❌ No"}
          </Row>
          <Row label="HTTP status at receipt">{delivery.httpStatus}</Row>
          <Row label="Received">{new Date(delivery.receivedAt).toLocaleString()}</Row>
          <Row label="Processed">
            {delivery.processedAt ? new Date(delivery.processedAt).toLocaleString() : "—"}
          </Row>
          <Row label="Error code">{delivery.errorCode ?? "—"}</Row>
          {delivery.errorMessage ? (
            <Row label="Error message">{delivery.errorMessage}</Row>
          ) : null}
        </dl>
      </section>

      {delivery.status === "QUARANTINED" ? (
        <section className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-6">
          <div>
            <h2 className="font-semibold text-amber-900">Quarantined payload</h2>
            <p className="mt-1 text-sm text-amber-800">
              This delivery was authenticated but could not be processed. The raw
              payload below is preserved exactly as received — replay it after the
              parser issue is fixed.
            </p>
          </div>
          {delivery.payloadRaw ? (
            <pre className="max-h-80 overflow-auto rounded-lg bg-zinc-900 p-4 font-mono text-xs text-zinc-100">
              {delivery.payloadRaw}
            </pre>
          ) : (
            <p className="text-sm text-amber-800">No stored payload for this delivery.</p>
          )}
          <ReplayButton deliveryId={delivery.id} />
        </section>
      ) : null}
    </div>
    </DashboardLayout>
  );
}

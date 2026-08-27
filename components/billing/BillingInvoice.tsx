import { formatCents } from "@/lib/billing/markup-math";
import {
  formatBillingDateTime,
  getBillingStatusLabel,
} from "@/components/billing/billing-labels";
import type { BillingRecordView } from "@/components/billing/billing-types";

export default function BillingInvoice({ record }: { record: BillingRecordView }) {
  const feeTotal = record.lineItems.reduce(
    (sum, item) => sum + (item.feeCents ?? 0),
    0,
  );

  return (
    <article className="mx-auto max-w-3xl bg-white p-8 print:p-0">
      <header className="border-b border-zinc-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          HireIQ placement invoice
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">{record.job.title}</h1>
        <p className="mt-2 text-zinc-600">{record.company.name}</p>
        <dl className="mt-4 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Invoice</dt>
            <dd className="font-medium text-black">#{record.id}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Status</dt>
            <dd className="font-medium text-black">
              {getBillingStatusLabel(record.status)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Issued</dt>
            <dd>{formatBillingDateTime(record.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Updated</dt>
            <dd>{formatBillingDateTime(record.updatedAt)}</dd>
          </div>
        </dl>
      </header>

      <p className="mt-6 text-sm text-zinc-600">
        Fee = placed CTC × markup. All three numbers are snapshotted at
        recording time. PAID is an internal marker until a payment processor
        is connected.
      </p>

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500">
            <th className="py-2 font-medium">Candidate</th>
            <th className="py-2 font-medium">Placed CTC</th>
            <th className="py-2 font-medium">Markup</th>
            <th className="py-2 font-medium">Fee</th>
          </tr>
        </thead>
        <tbody>
          {record.lineItems.map((item) => (
            <tr key={item.id} className="border-b border-zinc-100">
              <td className="py-3 font-medium text-black">
                {item.application.candidate.name}
              </td>
              <td className="py-3">
                {item.placedCtcCents != null
                  ? formatCents(item.placedCtcCents)
                  : "—"}
              </td>
              <td className="py-3">
                {item.markupBps != null ? `${item.markupBps / 100}%` : "—"}
              </td>
              <td className="py-3 font-medium text-black">
                {item.feeCents != null ? formatCents(item.feeCents) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="py-4 font-semibold text-black" colSpan={3}>
              Total fee
            </td>
            <td className="py-4 font-semibold text-black">
              {formatCents(feeTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </article>
  );
}

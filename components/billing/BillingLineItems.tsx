import Link from "next/link";

import {
  formatBillingDateTime,
  formatHiredCandidateCount,
  getBillingApplicationStatusLabel,
} from "@/components/billing/billing-labels";
import type { BillingLineItemView } from "@/components/billing/billing-types";

type BillingLineItemsProps = {
  lineItems: BillingLineItemView[];
  candidateHref?: (applicationId: number) => string | null;
};

export default function BillingLineItems({
  lineItems,
  candidateHref,
}: BillingLineItemsProps) {
  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Hired candidates</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Each line item is a hired application. No pricing or payment amounts
        are stored.
      </p>
      <p className="mt-2 text-sm font-medium text-black">
        {formatHiredCandidateCount(lineItems.length)}
      </p>

      {lineItems.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-black">
            No hired candidates on this billing record.
          </p>
          <p className="mt-2 text-sm text-zinc-600">
            Line items appear when a client confirms hire.
          </p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-200 rounded-xl border border-zinc-200">
          {lineItems.map((item) => {
            const href = candidateHref?.(item.applicationId) ?? null;

            return (
              <li key={item.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-black">
                      {href ? (
                        <Link
                          href={href}
                          className="underline underline-offset-2 hover:text-zinc-700"
                        >
                          {item.application.candidate.name}
                        </Link>
                      ) : (
                        item.application.candidate.name
                      )}
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">
                      {item.application.candidate.role}
                    </p>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
                    {getBillingApplicationStatusLabel(item.application.status)}
                  </span>
                </div>
                <dl className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
                  <div>
                    <dt className="text-zinc-500">Application</dt>
                    <dd className="font-medium text-black">
                      #{item.application.id}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Added to billing</dt>
                    <dd>{formatBillingDateTime(item.createdAt)}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

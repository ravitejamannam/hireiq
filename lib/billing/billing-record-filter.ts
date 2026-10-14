import type { BillingStatus } from "@prisma/client";

import {
  BILLING_STATUS_OPTIONS,
  getBillingStatusLabel,
} from "@/components/billing/billing-labels";

export type BillingFilterRecord = {
  status: BillingStatus;
  company: { name: string };
  job: { title: string };
  lineItems: Array<{ application: { candidate: { name: string } } }>;
};

export function billingStatusFilterOptions(): readonly BillingStatus[] {
  return BILLING_STATUS_OPTIONS;
}

export function filterBillingRecords<T extends BillingFilterRecord>(
  records: T[],
  statusFilter: BillingStatus | "ALL",
  search = "",
): T[] {
  const normalized = search.trim().toLowerCase();

  return records.filter((record) => {
    if (statusFilter !== "ALL" && record.status !== statusFilter) {
      return false;
    }

    if (!normalized) return true;

    const haystack = [
      record.company.name,
      record.job.title,
      getBillingStatusLabel(record.status),
      ...record.lineItems.map((item) => item.application.candidate.name),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

import { describe, expect, it } from "vitest";

import { BILLING_STATUS_OPTIONS } from "@/components/billing/billing-labels";
import {
  billingStatusFilterOptions,
  filterBillingRecords,
  type BillingFilterRecord,
} from "@/lib/billing/billing-record-filter";

function record(status: BillingFilterRecord["status"], name: string): BillingFilterRecord {
  return {
    status,
    company: { name: "Nimbus" },
    job: { title: name },
    lineItems: [],
  };
}

describe("billing status filters", () => {
  const records = [record("PENDING", "Pending role")];

  it("offers every supported status when the loaded records omit some", () => {
    expect(billingStatusFilterOptions()).toEqual(BILLING_STATUS_OPTIONS);
    expect(billingStatusFilterOptions()).toEqual([
      "PENDING",
      "READY",
      "INVOICED",
      "PAID",
      "CANCELLED",
    ]);
  });

  it("keeps only records in the selected status", () => {
    const mixed = [record("PENDING", "Pending role"), record("PAID", "Paid role")];
    expect(filterBillingRecords(mixed, "PAID").map((row) => row.job.title)).toEqual([
      "Paid role",
    ]);
  });

  it("returns every loaded record when the filter is All", () => {
    const mixed = [
      record("PENDING", "Pending role"),
      record("CANCELLED", "Cancelled role"),
    ];
    expect(filterBillingRecords(mixed, "ALL")).toEqual(mixed);
    expect(filterBillingRecords(records, "ALL")).toEqual(records);
  });
});

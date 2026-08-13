import type { BillingStatus } from "@prisma/client";

/**
 * Internal foundation labels only.
 * These do not imply payment gateway completion.
 */
export const billingStatusLabels: Record<BillingStatus, string> = {
  PENDING: "Pending",
  READY: "Ready",
  INVOICED: "Invoiced (internal)",
  PAID: "Marked paid (internal)",
  CANCELLED: "Cancelled",
};

export { ALLOWED_BILLING_STATUS_TRANSITIONS } from "@/lib/billing/constants";

export function getBillingStatusLabel(status: BillingStatus) {
  return billingStatusLabels[status] ?? status;
}

export function formatBillingDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export const BILLING_STATUS_OPTIONS: BillingStatus[] = [
  "PENDING",
  "READY",
  "INVOICED",
  "PAID",
  "CANCELLED",
];

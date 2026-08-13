import type { BillingStatus } from "@prisma/client";

/**
 * Explicit foundation transitions. Payment processing is not implemented;
 * PAID means an internal marker only.
 */
export const ALLOWED_BILLING_STATUS_TRANSITIONS: Record<
  BillingStatus,
  BillingStatus[]
> = {
  PENDING: ["READY", "CANCELLED"],
  READY: ["INVOICED", "CANCELLED", "PENDING"],
  INVOICED: ["PAID", "CANCELLED", "READY"],
  PAID: ["CANCELLED"],
  CANCELLED: [],
};

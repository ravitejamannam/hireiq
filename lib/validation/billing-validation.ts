import { BillingStatus } from "@prisma/client";

import { ALLOWED_BILLING_STATUS_TRANSITIONS } from "@/lib/billing/constants";
import { prisma } from "@/lib/prisma";

export class BillingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingValidationError";
  }
}

export function validateBillingRecordId(id: unknown) {
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    throw new BillingValidationError("Invalid billing record.");
  }

  return id;
}

export function validateBillingJobId(jobId: unknown) {
  if (typeof jobId !== "number" || !Number.isInteger(jobId) || jobId <= 0) {
    throw new BillingValidationError("Invalid requirement.");
  }

  return jobId;
}

export function validateBillingStatus(status: unknown): BillingStatus {
  if (
    typeof status !== "string" ||
    !Object.values(BillingStatus).includes(status as BillingStatus)
  ) {
    throw new BillingValidationError("Invalid billing status.");
  }

  return status as BillingStatus;
}

export function validateBillingStatusTransition(
  current: BillingStatus,
  next: BillingStatus,
) {
  if (current === next) {
    return next;
  }

  if (!ALLOWED_BILLING_STATUS_TRANSITIONS[current].includes(next)) {
    throw new BillingValidationError(
      "This billing status transition is not allowed.",
    );
  }

  return next;
}

export async function ensureJobExistsForBilling(jobId: number) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      companyId: true,
      title: true,
    },
  });

  if (!job) {
    throw new BillingValidationError("Resource not found.");
  }

  return job;
}

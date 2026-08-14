import { ApplicationPipelineStatus, BillingStatus } from "@prisma/client";

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

/**
 * Manual Admin billing create is not a hire workflow.
 * It must not plant a BillingRecord unless the Job already has a HIRED application.
 */
export async function assertJobHasHiredApplicationForBilling(jobId: number) {
  const hiredCount = await prisma.application.count({
    where: {
      jobId,
      status: ApplicationPipelineStatus.HIRED,
    },
  });

  if (hiredCount < 1) {
    throw new BillingValidationError(
      "Billing can only be created for requirements with a hired candidate.",
    );
  }
}

/**
 * Manual Admin billing create must not add a second active record
 * after the hire path already created one.
 */
export async function assertJobHasNoActiveBillingRecord(jobId: number) {
  const existing = await prisma.billingRecord.findFirst({
    where: {
      jobId,
      status: {
        not: "CANCELLED",
      },
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    throw new BillingValidationError("Billing record already exists.");
  }
}

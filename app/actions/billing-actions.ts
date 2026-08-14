"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import {
  AuthorizationError,
  requireAdmin,
} from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import {
  BillingValidationError,
  assertJobHasHiredApplicationForBilling,
  assertJobHasNoActiveBillingRecord,
  ensureJobExistsForBilling,
  validateBillingJobId,
  validateBillingRecordId,
  validateBillingStatus,
  validateBillingStatusTransition,
} from "@/lib/validation/billing-validation";

function revalidateBillingPaths(jobId: number) {
  try {
    revalidatePath("/dashboard/billing", "layout");
    revalidatePath("/dashboard/requirements");
    revalidatePath(`/dashboard/requirements/${jobId}`);
    revalidatePath("/client/billing", "layout");
    revalidatePath(`/client/requirements/${jobId}`);
    revalidatePath(`/client/requirements/${jobId}/billing`);
  } catch {
    // revalidatePath requires a Next.js request context
  }
}

function translateBillingSaveError(error: unknown) {
  if (error instanceof BillingValidationError) {
    return error;
  }

  if (error instanceof AuthorizationError) {
    return new AuthorizationError("Resource not found.");
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003") {
      return new Error("Billing record could not be created.");
    }

    if (error.code === "P2002") {
      return new Error("Billing record already exists.");
    }

    if (error.code === "P2025") {
      return new Error("Resource not found.");
    }
  }

  return new Error("Billing record could not be saved.");
}

/**
 * Admin-only. companyId is derived from the Job — never from the browser.
 */
export async function createBillingRecord(jobId: unknown) {
  await requireAdmin();

  const validatedJobId = validateBillingJobId(jobId);
  const job = await ensureJobExistsForBilling(validatedJobId);
  await assertJobHasHiredApplicationForBilling(job.id);
  await assertJobHasNoActiveBillingRecord(job.id);

  try {
    const record = await prisma.billingRecord.create({
      data: {
        jobId: job.id,
        companyId: job.companyId,
        status: "PENDING",
      },
      select: {
        id: true,
        status: true,
        jobId: true,
        companyId: true,
      },
    });

    revalidateBillingPaths(job.id);

    return record;
  } catch (error) {
    throw translateBillingSaveError(error);
  }
}

/**
 * Admin-only explicit status update. No payment side effects.
 */
export async function updateBillingRecordStatus(
  id: unknown,
  status: unknown,
) {
  await requireAdmin();

  const billingRecordId = validateBillingRecordId(id);
  const nextStatus = validateBillingStatus(status);

  const existing = await prisma.billingRecord.findUnique({
    where: { id: billingRecordId },
    select: {
      id: true,
      status: true,
      jobId: true,
    },
  });

  if (!existing) {
    throw new AuthorizationError("Resource not found.");
  }

  try {
    validateBillingStatusTransition(existing.status, nextStatus);

    const updated = await prisma.billingRecord.update({
      where: { id: existing.id },
      data: { status: nextStatus },
      select: {
        id: true,
        status: true,
        jobId: true,
        companyId: true,
      },
    });

    revalidateBillingPaths(existing.jobId);

    return updated;
  } catch (error) {
    throw translateBillingSaveError(error);
  }
}

/**
 * Admin-only soft cancel. Records are retained for auditability.
 */
export async function cancelBillingRecord(id: unknown) {
  return updateBillingRecordStatus(id, "CANCELLED");
}

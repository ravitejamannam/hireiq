import type { Prisma } from "@prisma/client";
import {
  ApplicationPipelineStatus,
  Prisma as PrismaNamespace,
  RequirementLifecycle,
} from "@prisma/client";

import {
  CLIENT_HIRING_REQUIREMENT_LIFECYCLES,
  jobAllowsClientHiringAction,
} from "@/lib/validation/application-pipeline";
import { BillingValidationError } from "@/lib/validation/billing-validation";

type Tx = Prisma.TransactionClient;

/**
 * After SELECTED → HIRED, ensure a BillingRecord exists for the
 * requirement/company and a BillingLineItem exists for the Application,
 * then mark the Job lifecycle as BILLING_GENERATED.
 *
 * Idempotent via @@unique([applicationId]) on BillingLineItem.
 * No fee/amount is invented — T62 foundation has none.
 *
 * Caller must already have transitioned the Application to HIRED
 * inside the same transaction.
 */
export async function generateBillingForHiredApplication(
  tx: Tx,
  applicationId: number,
) {
  const application = await tx.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      jobId: true,
      companyId: true,
      candidateId: true,
      job: {
        select: {
          id: true,
          companyId: true,
          requirementLifecycle: true,
        },
      },
    },
  });

  if (!application) {
    throw new BillingValidationError("Resource not found.");
  }

  if (application.status !== ApplicationPipelineStatus.HIRED) {
    throw new BillingValidationError(
      "Billing can only be generated for hired candidates.",
    );
  }

  if (application.companyId !== application.job.companyId) {
    throw new BillingValidationError(
      "Billing company does not match the requirement company.",
    );
  }

  if (!jobAllowsClientHiringAction(application.job.requirementLifecycle)) {
    throw new BillingValidationError(
      "Billing can only be generated after sourcing and shortlisting.",
    );
  }

  // Serialize concurrent hire billing for this requirement.
  await tx.$queryRaw`
    SELECT id FROM "Job" WHERE id = ${application.jobId} FOR UPDATE
  `;

  let billingRecord = await tx.billingRecord.findFirst({
    where: {
      jobId: application.jobId,
      companyId: application.companyId,
      status: {
        not: "CANCELLED",
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      companyId: true,
      jobId: true,
    },
  });

  if (!billingRecord) {
    try {
      billingRecord = await tx.billingRecord.create({
        data: {
          jobId: application.jobId,
          companyId: application.companyId,
          status: "PENDING",
        },
        select: {
          id: true,
          companyId: true,
          jobId: true,
        },
      });
    } catch (error) {
      // Concurrent create race: re-read the winner's record.
      if (
        error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        billingRecord = await tx.billingRecord.findFirst({
          where: {
            jobId: application.jobId,
            companyId: application.companyId,
            status: {
              not: "CANCELLED",
            },
          },
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
            companyId: true,
            jobId: true,
          },
        });
      } else {
        throw error;
      }
    }
  }

  if (!billingRecord) {
    throw new BillingValidationError("Billing record could not be created.");
  }

  if (
    billingRecord.companyId !== application.companyId ||
    billingRecord.jobId !== application.jobId
  ) {
    throw new BillingValidationError(
      "Billing company does not match the requirement company.",
    );
  }

  const lineItem = await tx.billingLineItem.upsert({
    where: {
      applicationId: application.id,
    },
    create: {
      applicationId: application.id,
      billingRecordId: billingRecord.id,
    },
    update: {
      // Idempotent: keep existing association; do not move between records.
    },
    select: {
      id: true,
      applicationId: true,
      billingRecordId: true,
    },
  });

  // Lifecycle advances only after billing succeeds (same transaction).
  // Cannot plant BILLING_GENERATED from a pre-sourcing requirement state.
  const lifecycleUpdate = await tx.job.updateMany({
    where: {
      id: application.jobId,
      companyId: application.companyId,
      requirementLifecycle: {
        in: CLIENT_HIRING_REQUIREMENT_LIFECYCLES,
      },
    },
    data: {
      requirementLifecycle: RequirementLifecycle.BILLING_GENERATED,
    },
  });

  if (lifecycleUpdate.count !== 1) {
    throw new BillingValidationError(
      "Billing can only be generated after sourcing and shortlisting.",
    );
  }

  return {
    billingRecord,
    lineItem,
  };
}

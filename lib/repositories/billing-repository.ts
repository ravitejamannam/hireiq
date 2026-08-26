import type { Prisma } from "@prisma/client";

import {
  AuthorizationError,
  billingScopeWhere,
  requireAdmin,
  requireClientPortal,
  requireUser,
} from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

const billingRecordSelect = {
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  companyId: true,
  jobId: true,
  company: {
    select: {
      id: true,
      name: true,
    },
  },
  job: {
    select: {
      id: true,
      title: true,
      status: true,
      requirementLifecycle: true,
    },
  },
  lineItems: {
    select: {
      id: true,
      applicationId: true,
      placedCtcCents: true,
      markupBps: true,
      feeCents: true,
      compensationRecordedAt: true,
      createdAt: true,
      updatedAt: true,
      application: {
        select: {
          id: true,
          status: true,
          candidateId: true,
          candidate: {
            select: {
              name: true,
              role: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc" as const,
    },
  },
} satisfies Prisma.BillingRecordSelect;

async function requireBillingActor() {
  const user = await requireUser();

  if (user.role === "INTERVIEWER") {
    throw new AuthorizationError("Resource not found.");
  }

  return user;
}

export async function getBillingRecords() {
  await requireAdmin();

  return prisma.billingRecord.findMany({
    select: billingRecordSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getBillingRecordById(id: number) {
  const user = await requireBillingActor();

  return prisma.billingRecord.findFirst({
    where: {
      id,
      ...billingScopeWhere(user),
    },
    select: billingRecordSelect,
  });
}

export async function getClientBillingRecords() {
  const client = await requireClientPortal();

  return prisma.billingRecord.findMany({
    where: {
      companyId: client.companyId,
    },
    select: billingRecordSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getClientBillingRecordById(id: number) {
  const client = await requireClientPortal();

  return prisma.billingRecord.findFirst({
    where: {
      id,
      companyId: client.companyId,
    },
    select: billingRecordSelect,
  });
}

export async function getBillingForRequirement(jobId: number) {
  const user = await requireBillingActor();

  return prisma.billingRecord.findMany({
    where: {
      jobId,
      ...billingScopeWhere(user),
    },
    select: billingRecordSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getClientBillingForRequirement(jobId: number) {
  const client = await requireClientPortal();

  return prisma.billingRecord.findMany({
    where: {
      jobId,
      companyId: client.companyId,
    },
    select: billingRecordSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getAdminJobsForBillingCreate() {
  await requireAdmin();

  return prisma.job.findMany({
    select: {
      id: true,
      title: true,
      company: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

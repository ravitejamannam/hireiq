"use server";

import { revalidatePath } from "next/cache";

import {
  AuthorizationError,
  requireAdmin,
  requireClientPortal,
  requireJobAccess,
  requireUser,
} from "@/lib/auth/authorization";
import {
  disconnectProviderConnectionForCompany,
  listProviderConnectionsForCompany,
  upsertProviderConnectionForCompany,
} from "@/lib/jobs/distribution/connection-service";
import {
  closeJobDistributionForCompany,
  createJobDistributionForCompany,
  listJobDistributionsForJob,
  pauseJobDistributionForCompany,
  publishJobDistributionForCompany,
  retryJobDistributionForCompany,
} from "@/lib/jobs/distribution/distribution-service";
import { prisma } from "@/lib/prisma";
import { PortalRole } from "@prisma/client";
import { JobDistributionError } from "@/lib/validation/job-distribution-validation";

function revalidateDistribution(jobId: number) {
  try {
    revalidatePath(`/client/requirements/${jobId}`);
    revalidatePath("/client/requirements");
    revalidatePath("/dashboard/jobs");
  } catch {
    // revalidatePath requires a Next.js request context
  }
}

async function authorizeDistributionCompany(jobId: number) {
  const user = await requireUser();

  if (user.role === PortalRole.ADMIN) {
    await requireAdmin();
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, companyId: true },
    });
    if (!job) {
      throw new JobDistributionError("Requirement not found.");
    }
    return { companyId: job.companyId, membershipRole: null as "OWNER" | "MEMBER" | null };
  }

  if (user.role !== PortalRole.CLIENT) {
    throw new AuthorizationError("Unauthorized.");
  }

  const client = await requireClientPortal();
  await requireJobAccess(jobId);
  return { companyId: client.companyId, membershipRole: client.membershipRole };
}

async function authorizeOwnerDistribution(jobId: number) {
  const actor = await authorizeDistributionCompany(jobId);
  if (actor.membershipRole === "MEMBER") {
    throw new JobDistributionError("Unauthorized.");
  }
  return actor;
}

async function authorizeConnectionMutation() {
  const client = await requireClientPortal();
  if (client.membershipRole !== "OWNER") {
    throw new JobDistributionError("Unauthorized.");
  }
  return client;
}

export async function connectProvider(input: {
  provider: unknown;
  providerAccountId?: unknown;
  credential?: unknown;
}) {
  const client = await authorizeConnectionMutation();
  const connection = await upsertProviderConnectionForCompany({
    companyId: client.companyId,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    credential: input.credential,
  });
  try {
    revalidatePath("/client");
    revalidatePath("/client/team");
  } catch {
    // revalidatePath requires a Next.js request context
  }
  return connection;
}

export async function disconnectProvider(provider: unknown) {
  const client = await authorizeConnectionMutation();
  const connection = await disconnectProviderConnectionForCompany({
    companyId: client.companyId,
    provider,
  });
  try {
    revalidatePath("/client");
  } catch {
    // revalidatePath requires a Next.js request context
  }
  return connection;
}

export async function listProviderConnections() {
  const client = await requireClientPortal();
  return listProviderConnectionsForCompany(client.companyId);
}

export async function createJobDistribution(input: {
  jobId: unknown;
  provider: unknown;
  applyMode: unknown;
  applyUrl?: unknown;
  includeCompensation?: unknown;
}) {
  const jobId =
    typeof input.jobId === "number"
      ? input.jobId
      : Number.parseInt(String(input.jobId), 10);
  const actor = await authorizeDistributionCompany(jobId);
  const distribution = await createJobDistributionForCompany({
    companyId: actor.companyId,
    jobId: input.jobId,
    provider: input.provider,
    applyMode: input.applyMode,
    applyUrl: input.applyUrl,
    includeCompensation: input.includeCompensation,
  });
  revalidateDistribution(distribution.jobId);
  return distribution;
}

export async function publishJobDistribution(input: {
  jobId: unknown;
  distributionId: unknown;
}) {
  const jobId =
    typeof input.jobId === "number"
      ? input.jobId
      : Number.parseInt(String(input.jobId), 10);
  const actor = await authorizeOwnerDistribution(jobId);
  const distribution = await publishJobDistributionForCompany({
    companyId: actor.companyId,
    distributionId: input.distributionId,
  });
  revalidateDistribution(distribution.jobId);
  return distribution;
}

export async function retryJobDistribution(input: {
  jobId: unknown;
  distributionId: unknown;
}) {
  const jobId =
    typeof input.jobId === "number"
      ? input.jobId
      : Number.parseInt(String(input.jobId), 10);
  const actor = await authorizeOwnerDistribution(jobId);
  const distribution = await retryJobDistributionForCompany({
    companyId: actor.companyId,
    distributionId: input.distributionId,
  });
  revalidateDistribution(distribution.jobId);
  return distribution;
}

export async function pauseJobDistribution(input: {
  jobId: unknown;
  distributionId: unknown;
}) {
  const jobId =
    typeof input.jobId === "number"
      ? input.jobId
      : Number.parseInt(String(input.jobId), 10);
  const actor = await authorizeOwnerDistribution(jobId);
  const distribution = await pauseJobDistributionForCompany({
    companyId: actor.companyId,
    distributionId: input.distributionId,
  });
  revalidateDistribution(distribution.jobId);
  return distribution;
}

export async function closeJobDistribution(input: {
  jobId: unknown;
  distributionId: unknown;
}) {
  const jobId =
    typeof input.jobId === "number"
      ? input.jobId
      : Number.parseInt(String(input.jobId), 10);
  const actor = await authorizeOwnerDistribution(jobId);
  const distribution = await closeJobDistributionForCompany({
    companyId: actor.companyId,
    distributionId: input.distributionId,
  });
  revalidateDistribution(distribution.jobId);
  return distribution;
}

export async function listJobDistributions(jobId: unknown) {
  const parsed =
    typeof jobId === "number" ? jobId : Number.parseInt(String(jobId), 10);
  const actor = await authorizeDistributionCompany(parsed);
  return listJobDistributionsForJob({
    jobId: parsed,
    companyId: actor.companyId,
  });
}

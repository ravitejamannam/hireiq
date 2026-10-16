import "@/lib/evidence-graph/evidence-graph-test-env";

import { afterAll, describe, expect, it, vi } from "vitest";
import {
  ApplyMode,
  DistributionProvider,
  JobDistributionStatus,
  JobSpecificationVersionStatus,
  JobStatus,
  OrganizationMemberStatus,
  PortalRole,
} from "@prisma/client";

const actor = vi.hoisted(() => ({ id: "0" }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

import {
  connectProvider,
  disconnectProvider,
  listJobDistributions,
  listProviderConnections,
  pauseJobDistribution,
  createJobDistribution,
} from "@/app/actions/distribution-actions";
import { AuthenticationError, AuthorizationError } from "@/lib/auth/authorization";
import { JobDistributionError } from "@/lib/validation/job-distribution-validation";
import { prisma } from "@/lib/prisma";

const MARKER = `dist-${process.pid}-${Date.now()}`;

function asUser(id: number) {
  actor.id = String(id);
}

describe("distribution authorization", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.jobDistribution.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.updateMany({
      where: { companyId: { in: companyIds } },
      data: { currentPublishedSpecificationVersionId: null },
    });
    await prisma.jobSpecificationVersion.deleteMany({
      where: { job: { companyId: { in: companyIds } } },
    });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.providerConnection.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.organizationMember.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  it("keeps provider credentials and distributions inside the active company", async () => {
    async function company(label: string) {
      const created = await prisma.company.create({
        data: {
          name: `${MARKER} ${label}`,
          industry: "Test",
          employees: 2,
          publicSlug: `${MARKER}-${label}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
        },
      });
      companyIds.push(created.id);
      return created;
    }

    const companyA = await company("a");
    const companyB = await company("b");

    async function user(label: string, companyId: number) {
      const created = await prisma.user.create({
        data: {
          email: `${MARKER}-${label}@hireiq.test`.toLowerCase(),
          name: label,
          role: PortalRole.CLIENT,
          passwordHash: "not-a-login",
          emailVerifiedAt: new Date(),
          companyId,
        },
      });
      userIds.push(created.id);
      return created.id;
    }

    const ownerA = await user("owner-a", companyA.id);
    const memberA = await user("member-a", companyA.id);
    const inactiveA = await user("inactive-a", companyA.id);
    const ownerB = await user("owner-b", companyB.id);

    await prisma.organizationMember.createMany({
      data: [
        { userId: ownerA, companyId: companyA.id, role: "OWNER", status: OrganizationMemberStatus.ACTIVE },
        { userId: memberA, companyId: companyA.id, role: "MEMBER", status: OrganizationMemberStatus.ACTIVE },
        { userId: inactiveA, companyId: companyA.id, role: "MEMBER", status: OrganizationMemberStatus.SUSPENDED },
        { userId: ownerB, companyId: companyB.id, role: "OWNER", status: OrganizationMemberStatus.ACTIVE },
      ],
    });

    const jobA = await prisma.job.create({
      data: { title: `${MARKER} a`, status: JobStatus.OPEN, companyId: companyA.id },
    });
    const jobB = await prisma.job.create({
      data: { title: `${MARKER} b`, status: JobStatus.OPEN, companyId: companyB.id },
    });
    const specB = await prisma.jobSpecificationVersion.create({
      data: {
        jobId: jobB.id,
        versionNumber: 1,
        status: JobSpecificationVersionStatus.PUBLISHED,
        publishedAt: new Date(),
        title: `${MARKER} b`,
      },
    });
    const distributionB = await prisma.jobDistribution.create({
      data: {
        companyId: companyB.id,
        jobId: jobB.id,
        jobSpecificationVersionId: specB.id,
        provider: DistributionProvider.MANUAL,
        status: JobDistributionStatus.PUBLISHED,
        applyMode: ApplyMode.EXTERNAL_URL,
        applyUrlSnapshot: "https://example.test/apply",
      },
    });

    asUser(ownerA);
    const connected = await connectProvider({ provider: DistributionProvider.MANUAL });
    expect(connected.companyId).toBe(companyA.id);
    expect(connected.status).toBe("ACTIVE");
    const disconnected = await disconnectProvider(DistributionProvider.MANUAL);
    expect(disconnected.companyId).toBe(companyA.id);
    expect(disconnected.status).toBe("INACTIVE");

    asUser(memberA);
    await expect(connectProvider({ provider: DistributionProvider.MANUAL })).rejects.toBeInstanceOf(
      JobDistributionError,
    );
    await expect(disconnectProvider(DistributionProvider.MANUAL)).rejects.toBeInstanceOf(
      JobDistributionError,
    );

    asUser(inactiveA);
    await expect(connectProvider({ provider: DistributionProvider.LINKEDIN })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(disconnectProvider(DistributionProvider.MANUAL)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(
      pauseJobDistribution({ jobId: jobA.id, distributionId: distributionB.id }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    asUser(0);
    await expect(connectProvider({ provider: DistributionProvider.MANUAL })).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    await expect(disconnectProvider(DistributionProvider.MANUAL)).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    await expect(listProviderConnections()).rejects.toBeInstanceOf(AuthenticationError);
    await expect(listJobDistributions(jobA.id)).rejects.toBeInstanceOf(AuthenticationError);

    asUser(memberA);
    await expect(
      createJobDistribution({
        jobId: jobB.id,
        provider: DistributionProvider.MANUAL,
        applyMode: ApplyMode.EXTERNAL_URL,
        applyUrl: "https://example.test/other",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      pauseJobDistribution({ jobId: jobA.id, distributionId: distributionB.id }),
    ).rejects.toBeInstanceOf(JobDistributionError);

    expect(
      await prisma.jobDistribution.count({ where: { jobId: jobB.id } }),
    ).toBe(1);
    expect(
      (await prisma.jobDistribution.findUnique({
        where: { id: distributionB.id },
        select: { status: true, companyId: true, jobId: true },
      })),
    ).toEqual({
      status: JobDistributionStatus.PUBLISHED,
      companyId: companyB.id,
      jobId: jobB.id,
    });
    expect(
      await prisma.distributionAttempt.count({ where: { distributionId: distributionB.id } }),
    ).toBe(0);
    expect(
      await prisma.providerConnection.count({ where: { companyId: companyB.id } }),
    ).toBe(0);
    expect(
      (await prisma.providerConnection.findUnique({
        where: {
          companyId_provider: {
            companyId: companyA.id,
            provider: DistributionProvider.MANUAL,
          },
        },
        select: { status: true },
      }))?.status,
    ).toBe("INACTIVE");
  });
});

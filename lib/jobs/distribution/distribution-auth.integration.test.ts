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
import {
  closeJobDistribution,
  connectProvider,
  createJobDistribution,
  disconnectProvider,
  listJobDistributions,
  listProviderConnections,
  pauseJobDistribution,
  publishJobDistribution,
  retryJobDistribution,
} from "@/app/actions/distribution-actions";
import { ManualProvider } from "@/lib/jobs/distribution/manual-provider";
import {
  resetDistributionAdaptersForTests,
  setDistributionAdapterForTests,
} from "@/lib/jobs/distribution/registry";
import { AuthenticationError, AuthorizationError } from "@/lib/auth/authorization";
import { JobDistributionError } from "@/lib/validation/job-distribution-validation";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const actor = vi.hoisted(() => ({ id: "0" }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));








const MARKER = `dist-${process.pid}-${Date.now()}`;

function asUser(id: number) {
  actor.id = String(id);
}

describe.skipIf(integrationDatabase.mode === "skip")("distribution authorization", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.distributionAttempt.deleteMany({
      where: { distribution: { companyId: { in: companyIds } } },
    });
    await prisma.providerPosting.deleteMany({
      where: { distribution: { companyId: { in: companyIds } } },
    });
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
    await prisma.interviewer.deleteMany({ where: { name: { startsWith: MARKER } } });
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
    const admin = await prisma.user.create({
      data: {
        email: `${MARKER}-admin@hireiq.test`.toLowerCase(),
        name: "admin",
        role: PortalRole.ADMIN,
        passwordHash: "not-a-login",
      },
    });
    userIds.push(admin.id);
    const interviewerProfile = await prisma.interviewer.create({
      data: { name: `${MARKER} iv`, category: "ENGINEERING" },
    });
    const interviewer = await prisma.user.create({
      data: {
        email: `${MARKER}-iv@hireiq.test`.toLowerCase(),
        name: "iv",
        role: PortalRole.INTERVIEWER,
        passwordHash: "not-a-login",
        interviewerId: interviewerProfile.id,
      },
    });
    userIds.push(interviewer.id);

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
    const specA = await prisma.jobSpecificationVersion.create({
      data: {
        jobId: jobA.id,
        versionNumber: 1,
        status: JobSpecificationVersionStatus.PUBLISHED,
        publishedAt: new Date(),
        title: `${MARKER} a`,
      },
    });
    await prisma.job.update({
      where: { id: jobA.id },
      data: { currentPublishedSpecificationVersionId: specA.id },
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

    const adapterCalls = { publish: 0, pause: 0, close: 0, update: 0 };
    const manual = new ManualProvider();
    setDistributionAdapterForTests(DistributionProvider.MANUAL, {
      provider: manual.provider,
      capabilities: () => manual.capabilities(),
      validateConnection: (connection) => manual.validateConnection(connection),
      previewPayload: (payload) => manual.previewPayload(payload),
      publish: async (input) => {
        adapterCalls.publish += 1;
        await new Promise((resolve) => setTimeout(resolve, 40));
        return manual.publish(input);
      },
      update: async (input) => {
        adapterCalls.update += 1;
        return manual.update(input);
      },
      pause: async (input) => {
        adapterCalls.pause += 1;
        return manual.pause(input);
      },
      close: async (input) => {
        adapterCalls.close += 1;
        return manual.close(input);
      },
      resume: (input) => manual.resume(input),
      fetchPosting: () => manual.fetchPosting(),
    });

    const memberReady = await prisma.jobDistribution.create({
      data: {
        companyId: companyA.id,
        jobId: jobA.id,
        jobSpecificationVersionId: specA.id,
        provider: DistributionProvider.NAUKRI,
        applyMode: ApplyMode.EXTERNAL_URL,
        applyUrlSnapshot: "https://example.test/member",
      },
    });
    const memberLive = await prisma.jobDistribution.create({
      data: {
        companyId: companyA.id,
        jobId: jobA.id,
        jobSpecificationVersionId: specA.id,
        provider: DistributionProvider.INDEED,
        status: JobDistributionStatus.PUBLISHED,
        applyMode: ApplyMode.EXTERNAL_URL,
        applyUrlSnapshot: "https://example.test/live",
      },
    });

    asUser(memberA);
    const created = await createJobDistribution({
      jobId: jobA.id,
      provider: DistributionProvider.MANUAL,
      applyMode: ApplyMode.EXTERNAL_URL,
      applyUrl: "https://example.test/draft",
    });
    expect(created.companyId).toBe(companyA.id);
    expect(created.status).toBe(JobDistributionStatus.READY);
    const listed = await listJobDistributions(jobA.id);
    expect(listed.some((row) => row.id === created.id)).toBe(true);
    const metadata = await listProviderConnections();
    expect(JSON.stringify(metadata)).not.toContain("credentialCiphertext");
    expect(metadata.every((row) => row.companyId === companyA.id)).toBe(true);

    await expect(
      publishJobDistribution({ jobId: jobA.id, distributionId: memberReady.id }),
    ).rejects.toBeInstanceOf(JobDistributionError);
    await expect(
      retryJobDistribution({ jobId: jobA.id, distributionId: memberReady.id }),
    ).rejects.toBeInstanceOf(JobDistributionError);
    await expect(
      closeJobDistribution({ jobId: jobA.id, distributionId: memberReady.id }),
    ).rejects.toBeInstanceOf(JobDistributionError);
    await expect(
      pauseJobDistribution({ jobId: jobA.id, distributionId: memberLive.id }),
    ).rejects.toBeInstanceOf(JobDistributionError);
    expect(adapterCalls).toEqual({ publish: 0, pause: 0, close: 0, update: 0 });
    expect(
      (await prisma.jobDistribution.findUnique({
        where: { id: memberReady.id },
        select: { status: true },
      }))?.status,
    ).toBe(JobDistributionStatus.READY);
    expect(
      (await prisma.jobDistribution.findUnique({
        where: { id: memberLive.id },
        select: { status: true },
      }))?.status,
    ).toBe(JobDistributionStatus.PUBLISHED);
    expect(
      await prisma.distributionAttempt.count({
        where: { distributionId: { in: [memberReady.id, memberLive.id] } },
      }),
    ).toBe(0);

    asUser(interviewer.id);
    await expect(listJobDistributions(jobA.id)).rejects.toBeInstanceOf(AuthorizationError);

    asUser(ownerA);
    const publishesBefore = adapterCalls.publish;
    const raced = await Promise.allSettled([
      publishJobDistribution({ jobId: jobA.id, distributionId: created.id }),
      publishJobDistribution({ jobId: jobA.id, distributionId: created.id }),
    ]);
    const succeeded = raced.filter((result) => result.status === "fulfilled");
    expect(succeeded).toHaveLength(1);
    if (succeeded[0]?.status === "fulfilled") {
      expect(succeeded[0].value.status).toBe(JobDistributionStatus.PUBLISHED);
    }
    expect(adapterCalls.publish - publishesBefore).toBe(1);
    expect(
      await prisma.distributionAttempt.count({ where: { distributionId: created.id } }),
    ).toBe(1);
    expect(
      (await prisma.jobDistribution.findUnique({
        where: { id: created.id },
        select: { status: true },
      }))?.status,
    ).toBe(JobDistributionStatus.PUBLISHED);

    const published = await publishJobDistribution({
      jobId: jobA.id,
      distributionId: created.id,
    });
    expect(published.status).toBe(JobDistributionStatus.PUBLISHED);
    await prisma.jobDistribution.update({
      where: { id: created.id },
      data: { status: JobDistributionStatus.FAILED },
    });
    const retried = await retryJobDistribution({
      jobId: jobA.id,
      distributionId: created.id,
    });
    expect(retried.status).toBe(JobDistributionStatus.PUBLISHED);
    const paused = await pauseJobDistribution({
      jobId: jobA.id,
      distributionId: created.id,
    });
    expect(paused.status).toBe(JobDistributionStatus.PAUSED);
    const closed = await closeJobDistribution({
      jobId: jobA.id,
      distributionId: created.id,
    });
    expect(closed.status).toBe(JobDistributionStatus.CLOSED);
    expect(adapterCalls.publish).toBeGreaterThan(0);
    expect(adapterCalls.pause).toBe(1);
    expect(adapterCalls.close).toBe(1);

    asUser(admin.id);
    const adminView = await listJobDistributions(jobB.id);
    expect(adminView.some((row) => row.id === distributionB.id)).toBe(true);
    await expect(connectProvider({ provider: DistributionProvider.MANUAL })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(disconnectProvider(DistributionProvider.MANUAL)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(
      (await prisma.jobDistribution.findUnique({
        where: { id: distributionB.id },
        select: { status: true },
      }))?.status,
    ).toBe(JobDistributionStatus.PUBLISHED);

    resetDistributionAdaptersForTests();
  });
});

import "@/lib/evidence-graph/evidence-graph-test-env";

import { afterAll, describe, expect, it, vi } from "vitest";
import {
  JobStatus,
  OrganizationMemberRole,
  PortalRole,
  RoleCategory,
} from "@prisma/client";

const actor = vi.hoisted(() => ({ id: "0" }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

import { createClientRequirement, createJob } from "@/app/actions/job-actions";
import { prisma } from "@/lib/prisma";

const MARKER = `idem-${process.pid}-${Date.now()}`;

function asUser(id: number) {
  actor.id = String(id);
}

function posted<T extends { id: number }>(result: T | { error: string }) {
  if ("error" in result) {
    throw new Error(result.error);
  }
  return result;
}

const fields = {
  roleCategory: "ENGINEERING" as const,
  experienceRange: "3-5",
  location: "Remote",
  compensationRange: "100-120",
  targetHireDate: new Date("2026-12-01T00:00:00.000Z"),
  numberOfPositions: 1,
  mustHaveRequirements: "TypeScript",
  niceToHaveRequirements: "GraphQL",
  jobDescription: "Build hiring software.",
  evaluationCriteria: "System design",
  primarySkills: "TypeScript",
};

describe("client requirement idempotency", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const questionIds: number[] = [];

  afterAll(async () => {
    if (questionIds.length > 0) {
      await prisma.assessmentBankQuestion.deleteMany({ where: { id: { in: questionIds } } });
    }
    if (companyIds.length === 0) return;
    const where = { companyId: { in: companyIds } };
    await prisma.job.updateMany({
      where,
      data: { currentPublishedSpecificationVersionId: null },
    });
    await prisma.jobSpecificationVersion.deleteMany({ where: { job: where } });
    await prisma.job.deleteMany({ where });
    await prisma.organizationMember.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  it("replays one key, allows another title post, and isolates companies", async () => {
    const bank = await prisma.assessmentBankQuestion.create({
      data: {
        roleCategory: RoleCategory.ENGINEERING,
        sortOrder: 810_000 + (process.pid % 1000),
        prompt: `${MARKER} question`,
        choices: ["Yes", "No"],
        correctIndex: 0,
        difficulty: "MEDIUM",
      },
    });
    questionIds.push(bank.id);

    const company = await prisma.company.create({
      data: {
        name: `${MARKER} a`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}-a`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    const other = await prisma.company.create({
      data: {
        name: `${MARKER} b`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}-b`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    companyIds.push(company.id, other.id);
    const owner = await prisma.user.create({
      data: {
        email: `${MARKER}-a@hireiq.test`.toLowerCase(),
        name: "owner",
        role: PortalRole.CLIENT,
        passwordHash: "not-a-login",
        emailVerifiedAt: new Date(),
        companyId: company.id,
      },
    });
    const otherOwner = await prisma.user.create({
      data: {
        email: `${MARKER}-b@hireiq.test`.toLowerCase(),
        name: "other",
        role: PortalRole.CLIENT,
        passwordHash: "not-a-login",
        emailVerifiedAt: new Date(),
        companyId: other.id,
      },
    });
    const admin = await prisma.user.create({
      data: {
        email: `${MARKER}-admin@hireiq.test`.toLowerCase(),
        name: "admin",
        role: PortalRole.ADMIN,
        passwordHash: "not-a-login",
      },
    });
    userIds.push(owner.id, otherOwner.id, admin.id);
    await prisma.organizationMember.createMany({
      data: [
        { userId: owner.id, companyId: company.id, role: OrganizationMemberRole.OWNER, status: "ACTIVE" },
        { userId: otherOwner.id, companyId: other.id, role: OrganizationMemberRole.OWNER, status: "ACTIVE" },
      ],
    });

    asUser(owner.id);
    const invalid = await createClientRequirement(`${MARKER} role`, fields, "not-a-uuid");
    expect(invalid).toEqual({ error: "Idempotency key is invalid." });
    expect(await prisma.job.count({ where: { companyId: company.id } })).toBe(0);

    const key = crypto.randomUUID();
    const rejected = await createClientRequirement(
      `${MARKER} role`,
      { ...fields, numberOfPositions: 0 },
      key,
    );
    expect(rejected).toEqual({ error: "Number of positions must be a positive integer." });
    expect(await prisma.job.count({ where: { companyId: company.id, clientCreateIdempotencyKey: key } })).toBe(0);

    const first = posted(await createClientRequirement(`${MARKER} role`, fields, key));
    const replay = posted(await createClientRequirement(`${MARKER} role`, fields, key));
    expect(replay.id).toBe(first.id);
    expect(await prisma.job.count({ where: { companyId: company.id, clientCreateIdempotencyKey: key } })).toBe(1);
    expect(
      await prisma.jobSpecificationVersion.count({
        where: { jobId: first.id, status: "PUBLISHED" },
      }),
    ).toBe(1);
    expect(replay.currentPublishedSpecificationVersionId).toBe(
      first.currentPublishedSpecificationVersionId,
    );

    const raceKey = crypto.randomUUID();
    const raced = await Promise.all([
      createClientRequirement(`${MARKER} race`, fields, raceKey),
      createClientRequirement(`${MARKER} race`, fields, raceKey),
    ]);
    const racedJobs = raced.map(posted);
    expect(racedJobs[0].id).toBe(racedJobs[1].id);
    expect(await prisma.job.count({ where: { companyId: company.id, clientCreateIdempotencyKey: raceKey } })).toBe(1);
    expect(
      await prisma.jobSpecificationVersion.count({
        where: { jobId: racedJobs[0].id, status: "PUBLISHED" },
      }),
    ).toBe(1);

    const secondKey = crypto.randomUUID();
    const second = posted(await createClientRequirement(`${MARKER} role`, fields, secondKey));
    expect(second.id).not.toBe(first.id);
    expect(await prisma.job.count({ where: { companyId: company.id, title: `${MARKER} role` } })).toBe(2);

    asUser(otherOwner.id);
    const otherJob = posted(await createClientRequirement(`${MARKER} role`, fields, key));
    expect(otherJob.id).not.toBe(first.id);
    expect(otherJob.companyId).toBe(other.id);
    expect(await prisma.job.count({ where: { companyId: company.id, clientCreateIdempotencyKey: key } })).toBe(1);

    asUser(admin.id);
    const legacyA = await createJob(`${MARKER} admin`, JobStatus.OPEN, company.id, fields);
    const legacyB = await createJob(`${MARKER} admin`, JobStatus.OPEN, company.id, fields);
    if ("error" in legacyA || "error" in legacyB) {
      throw new Error("admin create failed");
    }
    expect(legacyA.id).not.toBe(legacyB.id);
    expect(legacyA.clientCreateIdempotencyKey).toBeNull();
    expect(legacyB.clientCreateIdempotencyKey).toBeNull();
  });
});

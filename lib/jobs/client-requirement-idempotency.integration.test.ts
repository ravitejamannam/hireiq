import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  JobStatus,
  OrganizationMemberRole,
  PortalRole,
  RoleCategory,
} from "@prisma/client";
import { createClientRequirement, createJob } from "@/app/actions/job-actions";
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

describe.skipIf(integrationDatabase.mode === "skip")("client requirement idempotency", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const memberIds: number[] = [];
  const jobIds: number[] = [];
  const questionIds: number[] = [];

  afterAll(async () => {
    const companies = companyIds.filter((id) => id > 0);
    const users = userIds.filter((id) => id > 0);
    const members = memberIds.filter((id) => id > 0);
    const jobs = jobIds.filter((id) => id > 0);
    const questions = questionIds.filter((id) => id > 0);
    if (companies.length + users.length + members.length + jobs.length + questions.length === 0) return;

    const failures: string[] = [];
    const attempt = async (step: string, run: () => Promise<unknown>) => {
      try {
        await run();
        return true;
      } catch (error) {
        failures.push(`${step}: ${error instanceof Error ? error.message : "cleanup failed"}`);
        return false;
      }
    };

    // AssessmentBankQuestion has no company relation, so its delete does not
    // gate the company graph. Job.currentPublishedSpecificationVersion is
    // SetNull, so a pointer clear is not required before deleting versions.
    // JobSpecificationVersion.job is Restrict. OrganizationMember restricts
    // User and Company. Job.company is Restrict. The client users restrict Company.
    if (questions.length > 0) {
      await attempt("assessment bank questions", () =>
        prisma.assessmentBankQuestion.deleteMany({ where: { id: { in: questions } } }));
    }
    if (jobs.length > 0) {
      await attempt("published specification pointers", () =>
        prisma.job.updateMany({
          where: { id: { in: jobs } },
          data: { currentPublishedSpecificationVersionId: null },
        }));
    }
    let versionsGone = jobs.length === 0;
    if (jobs.length > 0) {
      versionsGone = await attempt("specification versions", () =>
        prisma.jobSpecificationVersion.deleteMany({ where: { jobId: { in: jobs } } }));
    }
    let membersGone = members.length === 0;
    if (members.length > 0) {
      membersGone = await attempt("organization members", () =>
        prisma.organizationMember.deleteMany({ where: { id: { in: members } } }));
    }
    let jobsGone = jobs.length === 0;
    if (versionsGone && jobs.length > 0) {
      jobsGone = await attempt("jobs", () =>
        prisma.job.deleteMany({ where: { id: { in: jobs } } }));
    }
    let usersGone = users.length === 0;
    if (membersGone && users.length > 0) {
      usersGone = await attempt("users", () =>
        prisma.user.deleteMany({ where: { id: { in: users } } }));
    }
    if (jobsGone && membersGone && usersGone && companies.length > 0) {
      await attempt("companies", () =>
        prisma.company.deleteMany({ where: { id: { in: companies } } }));
    }
    if (failures.length > 0) {
      throw new Error(`Client requirement fixture cleanup failed.\n${failures.join("\n")}`);
    }
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
    companyIds.push(company.id);
    const other = await prisma.company.create({
      data: {
        name: `${MARKER} b`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}-b`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    companyIds.push(other.id);
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
    userIds.push(owner.id);
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
    userIds.push(otherOwner.id);
    const admin = await prisma.user.create({
      data: {
        email: `${MARKER}-admin@hireiq.test`.toLowerCase(),
        name: "admin",
        role: PortalRole.ADMIN,
        passwordHash: "not-a-login",
      },
    });
    userIds.push(admin.id);
    const ownerMembership = await prisma.organizationMember.create({
      data: { userId: owner.id, companyId: company.id, role: OrganizationMemberRole.OWNER, status: "ACTIVE" },
    });
    memberIds.push(ownerMembership.id);
    const otherMembership = await prisma.organizationMember.create({
      data: { userId: otherOwner.id, companyId: other.id, role: OrganizationMemberRole.OWNER, status: "ACTIVE" },
    });
    memberIds.push(otherMembership.id);

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
    jobIds.push(first.id);
    const replay = posted(await createClientRequirement(`${MARKER} role`, fields, key));
    jobIds.push(replay.id);
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
    for (const result of raced) {
      if (!("error" in result)) jobIds.push(result.id);
    }
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
    jobIds.push(second.id);
    expect(second.id).not.toBe(first.id);
    expect(await prisma.job.count({ where: { companyId: company.id, title: `${MARKER} role` } })).toBe(2);

    asUser(otherOwner.id);
    const otherJob = posted(await createClientRequirement(`${MARKER} role`, fields, key));
    jobIds.push(otherJob.id);
    expect(otherJob.id).not.toBe(first.id);
    expect(otherJob.companyId).toBe(other.id);
    expect(await prisma.job.count({ where: { companyId: company.id, clientCreateIdempotencyKey: key } })).toBe(1);

    asUser(admin.id);
    const legacyA = await createJob(`${MARKER} admin`, JobStatus.OPEN, company.id, fields);
    if (!("error" in legacyA)) jobIds.push(legacyA.id);
    const legacyB = await createJob(`${MARKER} admin`, JobStatus.OPEN, company.id, fields);
    if (!("error" in legacyB)) jobIds.push(legacyB.id);
    if ("error" in legacyA || "error" in legacyB) {
      throw new Error("admin create failed");
    }
    expect(legacyA.id).not.toBe(legacyB.id);
    expect(legacyA.clientCreateIdempotencyKey).toBeNull();
    expect(legacyB.clientCreateIdempotencyKey).toBeNull();
  });
});

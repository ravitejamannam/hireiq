import "@/lib/evidence-graph/evidence-graph-test-env";

import { afterAll, describe, expect, it, vi } from "vitest";
import { OrganizationMemberRole, PortalRole, RoleCategory } from "@prisma/client";

const actor = vi.hoisted(() => ({ id: "0" }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

import { createClientRequirement } from "@/app/actions/job-actions";
import { ASSESSMENT_BANK_EMPTY } from "@/lib/assessments/assessment-errors";
import { prisma } from "@/lib/prisma";

const MARKER = `bank-${process.pid}-${Date.now()}`;

const fields = {
  roleCategory: "DESIGN" as const,
  experienceRange: "3-5",
  location: "Remote",
  compensationRange: "100-120",
  targetHireDate: new Date("2026-12-01T00:00:00.000Z"),
  numberOfPositions: 1,
  mustHaveRequirements: "Figma",
  niceToHaveRequirements: "Illustration",
  jobDescription: "Design the hiring product.",
  evaluationCriteria: "Portfolio",
  primarySkills: "Figma",
};

describe("assessment configuration on client post", () => {
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

  it("requires an active question in the selected category and retries the same key", async () => {
    const parkedDesign = await prisma.assessmentBankQuestion.findMany({
      where: { roleCategory: RoleCategory.DESIGN, active: true },
      select: { id: true },
    });
    if (parkedDesign.length > 0) {
      await prisma.assessmentBankQuestion.updateMany({
        where: { id: { in: parkedDesign.map((row) => row.id) } },
        data: { active: false },
      });
    }
    try {
    const existingDesign = await prisma.assessmentBankQuestion.count({
      where: { roleCategory: RoleCategory.DESIGN, active: true },
    });
    expect(existingDesign).toBe(0);

    const engineering = await prisma.assessmentBankQuestion.create({
      data: {
        roleCategory: RoleCategory.ENGINEERING,
        sortOrder: 820_000 + (process.pid % 1000),
        prompt: `${MARKER} engineering`,
        choices: ["Yes", "No"],
        correctIndex: 0,
        difficulty: "MEDIUM",
      },
    });
    questionIds.push(engineering.id);

    const company = await prisma.company.create({
      data: {
        name: `${MARKER} co`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    companyIds.push(company.id);
    const owner = await prisma.user.create({
      data: {
        email: `${MARKER}@hireiq.test`.toLowerCase(),
        name: "owner",
        role: PortalRole.CLIENT,
        passwordHash: "not-a-login",
        emailVerifiedAt: new Date(),
        companyId: company.id,
      },
    });
    userIds.push(owner.id);
    await prisma.organizationMember.create({
      data: {
        userId: owner.id,
        companyId: company.id,
        role: OrganizationMemberRole.OWNER,
        status: "ACTIVE",
      },
    });
    actor.id = String(owner.id);

    const key = crypto.randomUUID();
    const blocked = await createClientRequirement(`${MARKER} role`, fields, key);
    expect(blocked).toEqual({ error: ASSESSMENT_BANK_EMPTY });
    expect(ASSESSMENT_BANK_EMPTY).toContain("this role category");
    expect(await prisma.job.count({ where: { companyId: company.id } })).toBe(0);
    expect(
      await prisma.jobSpecificationVersion.count({ where: { job: { companyId: company.id } } }),
    ).toBe(0);

    const design = await prisma.assessmentBankQuestion.create({
      data: {
        roleCategory: RoleCategory.DESIGN,
        sortOrder: 821_000 + (process.pid % 1000),
        prompt: `${MARKER} design`,
        choices: ["Yes", "No"],
        correctIndex: 0,
        difficulty: "MEDIUM",
      },
    });
    questionIds.push(design.id);

    const posted = await createClientRequirement(`${MARKER} role`, fields, key);
    if ("error" in posted) {
      throw new Error(posted.error);
    }
    expect(await prisma.job.count({ where: { companyId: company.id, clientCreateIdempotencyKey: key } })).toBe(1);
    expect(
      await prisma.jobSpecificationVersion.count({
        where: { jobId: posted.id, status: "PUBLISHED" },
      }),
    ).toBe(1);
    } finally {
      if (parkedDesign.length > 0) {
        await prisma.assessmentBankQuestion.updateMany({
          where: { id: { in: parkedDesign.map((row) => row.id) } },
          data: { active: true },
        });
      }
    }
  });
});

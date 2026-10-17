import "@/lib/evidence-graph/evidence-graph-test-env";

import { afterAll, describe, expect, it, vi } from "vitest";
import { OrganizationMemberRole, PortalRole } from "@prisma/client";

const actor = vi.hoisted(() => ({ id: "0" }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

vi.mock("@/lib/jobs/posted-requirement", () => ({
  createPostedRequirementForCompany: vi.fn(async () => {
    throw new Error("database down");
  }),
}));

import { createClientRequirement } from "@/app/actions/job-actions";
import { prisma } from "@/lib/prisma";

const MARKER = `boom-${process.pid}-${Date.now()}`;

describe("client requirement unexpected errors", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.organizationMember.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  it("does not convert an unexpected failure into a validation error", async () => {
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

    await expect(
      createClientRequirement("Role", {}, crypto.randomUUID()),
    ).rejects.toThrow("database down");
  });
});

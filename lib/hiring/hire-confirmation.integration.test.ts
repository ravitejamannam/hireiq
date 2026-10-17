import "@/lib/evidence-graph/evidence-graph-test-env";

import { afterAll, describe, expect, it, vi } from "vitest";
import {
  ApplicationPipelineStatus,
  CandidateStatus,
  JobStatus,
  OrganizationMemberRole,
  PortalRole,
  RequirementLifecycle,
} from "@prisma/client";

const actor = vi.hoisted(() => ({ id: "0" }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

import { confirmClientCandidateHire } from "@/app/actions/application-actions";
import { AuthorizationError } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

const MARKER = `hire-${process.pid}-${Date.now()}`;

function asUser(id: number) {
  actor.id = String(id);
}

describe("hire confirmation permission", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.outcomeEvent.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.auditLog.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.billingLineItem.deleteMany({
      where: { billingRecord: { companyId: { in: companyIds } } },
    });
    await prisma.billingRecord.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.organizationMember.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  it("lets owners confirm hire and members only when the company allows it", async () => {
    async function company(label: string, membersCanConfirmHire = false) {
      const created = await prisma.company.create({
        data: {
          name: `${MARKER} ${label}`,
          industry: "Test",
          employees: 2,
          publicSlug: `${MARKER}-${label}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
          membersCanConfirmHire,
        },
      });
      companyIds.push(created.id);
      return created;
    }

    const companyA = await company("a");
    const companyB = await company("b");

    async function user(label: string, role: PortalRole, companyId: number | null) {
      const created = await prisma.user.create({
        data: {
          email: `${MARKER}-${label}@hireiq.test`.toLowerCase(),
          name: label,
          role,
          passwordHash: "not-a-login",
          emailVerifiedAt: new Date(),
          companyId,
        },
      });
      userIds.push(created.id);
      return created.id;
    }

    const ownerA = await user("owner-a", PortalRole.CLIENT, companyA.id);
    const memberA = await user("member-a", PortalRole.CLIENT, companyA.id);
    const ownerB = await user("owner-b", PortalRole.CLIENT, companyB.id);
    const admin = await user("admin", PortalRole.ADMIN, null);

    await prisma.organizationMember.createMany({
      data: [
        { userId: ownerA, companyId: companyA.id, role: OrganizationMemberRole.OWNER, status: "ACTIVE" },
        { userId: memberA, companyId: companyA.id, role: OrganizationMemberRole.MEMBER, status: "ACTIVE" },
        { userId: ownerB, companyId: companyB.id, role: OrganizationMemberRole.OWNER, status: "ACTIVE" },
      ],
    });

    async function selectedApplication(companyId: number, label: string) {
      const job = await prisma.job.create({
        data: {
          title: `${MARKER} ${label}`,
          status: JobStatus.OPEN,
          companyId,
          requirementLifecycle: RequirementLifecycle.SOURCING_SHORTLISTING,
        },
      });
      const candidate = await prisma.candidate.create({
        data: {
          name: `${MARKER} ${label}`,
          role: "Engineer",
          experienceYears: 2,
          status: CandidateStatus.APPLIED,
          companyId,
        },
      });
      return prisma.application.create({
        data: {
          candidateId: candidate.id,
          jobId: job.id,
          companyId,
          status: ApplicationPipelineStatus.SELECTED,
        },
      });
    }

    const ownerApplication = await selectedApplication(companyA.id, "owner");
    const memberApplication = await selectedApplication(companyA.id, "member");
    const otherApplication = await selectedApplication(companyB.id, "other");

    async function hiredEvents(applicationId: number) {
      return prisma.outcomeEvent.count({
        where: { applicationId, eventType: "HIRED" },
      });
    }

    asUser(memberA);
    await expect(confirmClientCandidateHire(memberApplication.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(
      (await prisma.application.findUnique({
        where: { id: memberApplication.id },
        select: { status: true },
      }))?.status,
    ).toBe(ApplicationPipelineStatus.SELECTED);
    expect(await hiredEvents(memberApplication.id)).toBe(0);

    asUser(ownerA);
    await expect(confirmClientCandidateHire(otherApplication.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(
      (await prisma.application.findUnique({
        where: { id: otherApplication.id },
        select: { status: true },
      }))?.status,
    ).toBe(ApplicationPipelineStatus.SELECTED);
    expect(await hiredEvents(otherApplication.id)).toBe(0);

    const hired = await confirmClientCandidateHire(ownerApplication.id);
    expect(hired.status).toBe(ApplicationPipelineStatus.HIRED);
    expect(await hiredEvents(ownerApplication.id)).toBe(1);

    asUser(admin);
    await expect(confirmClientCandidateHire(otherApplication.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(
      (await prisma.application.findUnique({
        where: { id: otherApplication.id },
        select: { status: true },
      }))?.status,
    ).toBe(ApplicationPipelineStatus.SELECTED);

    await prisma.company.update({
      where: { id: companyA.id },
      data: { membersCanConfirmHire: true },
    });
    asUser(memberA);
    const memberHired = await confirmClientCandidateHire(memberApplication.id);
    expect(memberHired.status).toBe(ApplicationPipelineStatus.HIRED);
    expect(await hiredEvents(memberApplication.id)).toBe(1);
  });
});

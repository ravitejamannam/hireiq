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

import {
  confirmClientCandidateHire,
  transitionApplicationStatus,
} from "@/app/actions/application-actions";
import {
  suspendOrganizationMember,
  transferOwnership,
} from "@/app/actions/organization-actions";
import { getAuditLogPage } from "@/lib/audit/audit-log";
import { AuthorizationError } from "@/lib/auth/authorization";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";

const MARKER = `audit-${process.pid}-${Date.now()}`;

function asUser(id: number) {
  actor.id = String(id);
}

describe("audit log", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await deleteAuditLogsForTests({ companyId: { in: companyIds } });
    await prisma.outcomeEvent.deleteMany({ where: { companyId: { in: companyIds } } });
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

  it("records hiring and membership actions without logging denied attempts", async () => {
    const companyA = await prisma.company.create({
      data: {
        name: `${MARKER} a`,
        industry: "Test",
        employees: 2,
        publicSlug: `${MARKER}-a`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    const companyB = await prisma.company.create({
      data: {
        name: `${MARKER} b`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}-b`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    companyIds.push(companyA.id, companyB.id);

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

    const ownerA = await user("owner", PortalRole.CLIENT, companyA.id);
    const memberA = await user("member", PortalRole.CLIENT, companyA.id);
    const targetA = await user("target", PortalRole.CLIENT, companyA.id);
    const admin = await user("admin", PortalRole.ADMIN, null);
    await prisma.organizationMember.createMany({
      data: [
        { userId: ownerA, companyId: companyA.id, role: OrganizationMemberRole.OWNER, status: "ACTIVE" },
        { userId: memberA, companyId: companyA.id, role: OrganizationMemberRole.MEMBER, status: "ACTIVE" },
        { userId: targetA, companyId: companyA.id, role: OrganizationMemberRole.MEMBER, status: "ACTIVE" },
      ],
    });

    const job = await prisma.job.create({
      data: {
        title: `${MARKER} role`,
        status: JobStatus.OPEN,
        companyId: companyA.id,
        requirementLifecycle: RequirementLifecycle.SOURCING_SHORTLISTING,
      },
    });
    const candidate = await prisma.candidate.create({
      data: {
        name: `${MARKER} candidate`,
        role: "Engineer",
        experienceYears: 2,
        status: CandidateStatus.APPLIED,
        companyId: companyA.id,
      },
    });
    const selected = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        companyId: companyA.id,
        status: ApplicationPipelineStatus.SELECTED,
      },
    });
    const pool = await prisma.application.create({
      data: {
        candidateId: (
          await prisma.candidate.create({
            data: {
              name: `${MARKER} pool`,
              role: "Engineer",
              experienceYears: 1,
              status: CandidateStatus.APPLIED,
              companyId: companyA.id,
            },
          })
        ).id,
        jobId: job.id,
        companyId: companyA.id,
        status: ApplicationPipelineStatus.CV_POOL,
      },
    });

    asUser(memberA);
    await expect(confirmClientCandidateHire(selected.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(await prisma.auditLog.count({ where: { companyId: companyA.id } })).toBe(0);

    asUser(ownerA);
    await confirmClientCandidateHire(selected.id);
    const hire = await prisma.auditLog.findFirst({
      where: { companyId: companyA.id, action: "HIRE_CONFIRMED" },
    });
    expect(hire?.actorUserId).toBe(ownerA);
    expect(hire?.actorRole).toBe("OWNER");
    expect(hire?.targetType).toBe("APPLICATION");
    expect(hire?.targetId).toBe(selected.id);

    const targetMembership = await prisma.organizationMember.findFirst({
      where: { userId: targetA, companyId: companyA.id },
    });
    await suspendOrganizationMember(targetMembership!.id);
    await prisma.organizationMember.update({
      where: { id: targetMembership!.id },
      data: { status: "SUSPENDED" },
    });
    const { reinstateOrganizationMember } = await import(
      "@/app/actions/organization-actions"
    );
    await reinstateOrganizationMember(targetMembership!.id);
    const suspended = await prisma.auditLog.findFirst({
      where: { action: "MEMBER_SUSPENDED", targetId: targetMembership!.id },
    });
    const reinstated = await prisma.auditLog.findFirst({
      where: { action: "MEMBER_REINSTATED", targetId: targetMembership!.id },
    });
    expect(suspended?.actorUserId).toBe(ownerA);
    expect(suspended?.companyId).toBe(companyA.id);
    expect(reinstated?.companyId).toBe(companyA.id);

    await transferOwnership(targetMembership!.id);
    const roleChange = await prisma.auditLog.findFirst({
      where: { action: "MEMBERSHIP_ROLE_CHANGED", targetId: targetMembership!.id },
    });
    expect(roleChange?.actorRole).toBe("OWNER");
    expect(roleChange?.reason).toBe("MEMBER to OWNER");
    const demotion = await prisma.auditLog.findFirst({
      where: {
        action: "MEMBERSHIP_ROLE_CHANGED",
        targetId: (
          await prisma.organizationMember.findFirst({
            where: { userId: ownerA, companyId: companyA.id },
          })
        )?.id,
      },
    });
    expect(demotion?.actorUserId).toBe(ownerA);
    expect(demotion?.actorRole).toBe("OWNER");
    expect(demotion?.companyId).toBe(companyA.id);
    expect(demotion?.reason).toBe("OWNER to MEMBER");

    asUser(admin);
    await transitionApplicationStatus(pool.id, ApplicationPipelineStatus.REJECTED, "Not a fit");
    const rejection = await prisma.auditLog.findFirst({
      where: { action: "APPLICATION_REJECTED", targetId: pool.id },
    });
    expect(rejection?.actorRole).toBe("ADMIN");
    expect(rejection?.companyId).toBe(companyA.id);
    expect(rejection?.reason).toBe("Not a fit");

    const companyAPage = await getAuditLogPage({ companyId: companyA.id });
    expect(companyAPage.entries.every((entry) => entry.companyId === companyA.id)).toBe(true);
    const companyBPage = await getAuditLogPage({ companyId: companyB.id });
    expect(companyBPage.entries).toHaveLength(0);

    asUser(memberA);
    await expect(getAuditLogPage({ companyId: companyA.id })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("rolls back both role changes when the demotion audit cannot be saved", async () => {
    const company = await prisma.company.create({
      data: {
        name: `${MARKER} rollback`,
        industry: "Test",
        employees: 2,
        publicSlug: `${MARKER}-rollback`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    companyIds.push(company.id);
    const owner = await prisma.user.create({
      data: {
        email: `${MARKER}-rollback-owner@hireiq.test`.toLowerCase(),
        name: "rollback owner",
        role: PortalRole.CLIENT,
        passwordHash: "not-a-login",
        emailVerifiedAt: new Date(),
        companyId: company.id,
      },
    });
    const member = await prisma.user.create({
      data: {
        email: `${MARKER}-rollback-member@hireiq.test`.toLowerCase(),
        name: "rollback member",
        role: PortalRole.CLIENT,
        passwordHash: "not-a-login",
        emailVerifiedAt: new Date(),
        companyId: company.id,
      },
    });
    userIds.push(owner.id, member.id);
    const ownerMembership = await prisma.organizationMember.create({
      data: {
        userId: owner.id,
        companyId: company.id,
        role: OrganizationMemberRole.OWNER,
        status: "ACTIVE",
      },
    });
    const memberMembership = await prisma.organizationMember.create({
      data: {
        userId: member.id,
        companyId: company.id,
        role: OrganizationMemberRole.MEMBER,
        status: "ACTIVE",
      },
    });

    await prisma.$executeRawUnsafe(
      `ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "audit_log_reason_test_guard"`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "AuditLog" ADD CONSTRAINT "audit_log_reason_test_guard" CHECK (reason IS DISTINCT FROM 'OWNER to MEMBER') NOT VALID`,
    );
    try {
      asUser(owner.id);
      const result = await transferOwnership(memberMembership.id);
      expect(result.ok).toBe(false);
      const roles = await prisma.organizationMember.findMany({
        where: { companyId: company.id },
        select: { id: true, role: true },
      });
      expect(roles.find((row) => row.id === ownerMembership.id)?.role).toBe(
        OrganizationMemberRole.OWNER,
      );
      expect(roles.find((row) => row.id === memberMembership.id)?.role).toBe(
        OrganizationMemberRole.MEMBER,
      );
      expect(
        await prisma.auditLog.count({
          where: { companyId: company.id, action: "MEMBERSHIP_ROLE_CHANGED" },
        }),
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "audit_log_reason_test_guard"`,
      );
    }
  });
});

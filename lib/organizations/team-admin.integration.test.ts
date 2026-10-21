import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  OrganizationMemberRole,
  OrganizationMemberStatus,
  PortalRole,
} from "@prisma/client";
import {
  loadCompanyTeam,
  removeOrganizationMember,
  reinstateOrganizationMember,
  revokeOrganizationInvitation,
  suspendOrganizationMember,
  transferOwnership,
} from "@/app/actions/organization-actions";
import { OrganizationMembershipError } from "@/lib/validation/organization-membership-validation";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
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






const MARKER = `team-${process.pid}-${Date.now()}`;

function asUser(id: number) {
  actor.id = String(id);
}

describe.skipIf(integrationDatabase.mode === "skip")("organization team authorization", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.invitation.deleteMany({ where: { companyId: { in: companyIds } } });
    await deleteAuditLogsForTests({ companyId: { in: companyIds } });
    await prisma.organizationMember.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  it("keeps team administration inside the owning company", async () => {
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

    async function membership(
      userId: number,
      companyId: number,
      role: OrganizationMemberRole,
    ) {
      return prisma.organizationMember.create({
        data: { userId, companyId, role, status: OrganizationMemberStatus.ACTIVE },
      });
    }

    const ownerAUser = await user("owner-a", companyA.id);
    const memberAUser = await user("member-a", companyA.id);
    const suspendTargetUser = await user("suspend-a", companyA.id);
    const removeTargetUser = await user("remove-a", companyA.id);
    const transferTargetUser = await user("transfer-a", companyA.id);
    const ownerBUser = await user("owner-b", companyB.id);
    const memberBUser = await user("member-b", companyB.id);

    const ownerA = await membership(ownerAUser, companyA.id, OrganizationMemberRole.OWNER);
    const memberA = await membership(memberAUser, companyA.id, OrganizationMemberRole.MEMBER);
    const suspendTarget = await membership(
      suspendTargetUser,
      companyA.id,
      OrganizationMemberRole.MEMBER,
    );
    const removeTarget = await membership(
      removeTargetUser,
      companyA.id,
      OrganizationMemberRole.MEMBER,
    );
    const transferTarget = await membership(
      transferTargetUser,
      companyA.id,
      OrganizationMemberRole.MEMBER,
    );
    const ownerB = await membership(ownerBUser, companyB.id, OrganizationMemberRole.OWNER);
    const memberB = await membership(memberBUser, companyB.id, OrganizationMemberRole.MEMBER);

    const invitationA = await prisma.invitation.create({
      data: {
        companyId: companyA.id,
        email: `${MARKER}-invite-a@hireiq.test`,
        role: OrganizationMemberRole.MEMBER,
        tokenHash: `${MARKER}-token-a`,
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedByUserId: ownerAUser,
      },
    });
    const invitationB = await prisma.invitation.create({
      data: {
        companyId: companyB.id,
        email: `${MARKER}-invite-b@hireiq.test`,
        role: OrganizationMemberRole.MEMBER,
        tokenHash: `${MARKER}-token-b`,
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedByUserId: ownerBUser,
      },
    });

    async function snapshot() {
      const members = await prisma.organizationMember.findMany({
        where: { companyId: { in: [companyA.id, companyB.id] } },
        select: { id: true, companyId: true, userId: true, role: true, status: true },
        orderBy: { id: "asc" },
      });
      const invitations = await prisma.invitation.findMany({
        where: { id: { in: [invitationA.id, invitationB.id] } },
        select: { id: true, companyId: true, revokedAt: true },
        orderBy: { id: "asc" },
      });
      return { members, invitations };
    }

    const before = await snapshot();

    asUser(memberAUser);
    for (const call of [
      suspendOrganizationMember(suspendTarget.id),
      reinstateOrganizationMember(suspendTarget.id),
      removeOrganizationMember(removeTarget.id),
      transferOwnership(transferTarget.id),
    ]) {
      const result = await call;
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Only the company owner can manage team members.");
      }
    }
    await expect(revokeOrganizationInvitation(invitationA.id)).rejects.toBeInstanceOf(
      OrganizationMembershipError,
    );
    await expect(loadCompanyTeam()).rejects.toBeInstanceOf(OrganizationMembershipError);
    expect(await snapshot()).toEqual(before);

    asUser(0);
    await expect(suspendOrganizationMember(suspendTarget.id)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);

    asUser(ownerAUser);
    for (const call of [
      suspendOrganizationMember(memberB.id),
      reinstateOrganizationMember(memberB.id),
      removeOrganizationMember(memberB.id),
      transferOwnership(memberB.id),
    ]) {
      const result = await call;
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Team member not found in your company.");
      }
    }
    await expect(revokeOrganizationInvitation(invitationB.id)).rejects.toBeInstanceOf(
      OrganizationMembershipError,
    );
    const self = await removeOrganizationMember(ownerA.id);
    expect(self.ok).toBe(false);
    expect(await snapshot()).toEqual(before);

    const suspended = await suspendOrganizationMember(suspendTarget.id);
    expect(suspended.ok).toBe(true);
    if (suspended.ok) expect(suspended.member.status).toBe("SUSPENDED");
    const reinstated = await reinstateOrganizationMember(suspendTarget.id);
    expect(reinstated.ok).toBe(true);
    if (reinstated.ok) expect(reinstated.member.status).toBe("ACTIVE");

    const removed = await removeOrganizationMember(removeTarget.id);
    expect(removed.ok).toBe(true);
    if (removed.ok) expect(removed.member.status).toBe("REMOVED");

    const revoked = await revokeOrganizationInvitation(invitationA.id);
    expect(revoked.revoked).toBe(true);

    const team = await loadCompanyTeam();
    expect(team.members.some((row) => row.id === memberB.id)).toBe(false);
    expect(team.members.some((row) => row.id === suspendTarget.id)).toBe(true);

    const transferred = await transferOwnership(transferTarget.id);
    expect(transferred.ok).toBe(true);

    const finalMembers = await prisma.organizationMember.findMany({
      where: { companyId: companyA.id },
      select: { id: true, role: true, status: true },
    });
    expect(finalMembers.find((row) => row.id === ownerA.id)?.role).toBe(
      OrganizationMemberRole.MEMBER,
    );
    expect(finalMembers.find((row) => row.id === transferTarget.id)?.role).toBe(
      OrganizationMemberRole.OWNER,
    );
    expect(
      finalMembers.filter(
        (row) =>
          row.role === OrganizationMemberRole.OWNER &&
          row.status === OrganizationMemberStatus.ACTIVE,
      ),
    ).toHaveLength(1);
    expect(finalMembers.find((row) => row.id === removeTarget.id)?.status).toBe(
      OrganizationMemberStatus.REMOVED,
    );
    expect(finalMembers.find((row) => row.id === memberA.id)?.role).toBe(
      OrganizationMemberRole.MEMBER,
    );
    expect(finalMembers.find((row) => row.id === suspendTarget.id)?.status).toBe(
      OrganizationMemberStatus.ACTIVE,
    );

    const companyBMembers = await prisma.organizationMember.findMany({
      where: { companyId: companyB.id },
      select: { id: true, role: true, status: true },
      orderBy: { id: "asc" },
    });
    expect(companyBMembers).toEqual([
      {
        id: ownerB.id,
        role: OrganizationMemberRole.OWNER,
        status: OrganizationMemberStatus.ACTIVE,
      },
      {
        id: memberB.id,
        role: OrganizationMemberRole.MEMBER,
        status: OrganizationMemberStatus.ACTIVE,
      },
    ]);
    expect(
      (await prisma.invitation.findUnique({
        where: { id: invitationB.id },
        select: { revokedAt: true },
      }))?.revokedAt,
    ).toBeNull();
    expect(
      (await prisma.invitation.findUnique({
        where: { id: invitationA.id },
        select: { revokedAt: true },
      }))?.revokedAt,
    ).not.toBeNull();
  });
});

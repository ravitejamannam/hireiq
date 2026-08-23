import {
  OrganizationMemberRole,
  OrganizationMemberStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Team administration for company owners (T96 Phase 6).
 *
 * All functions require an ACTIVE OWNER membership derived server-side
 * from the actor's user id — never from request data. Tenant scoping
 * always goes through composite ownership (companyId + memberId), never
 * findUnique({ id }) alone (constitution §39).
 *
 * Status semantics:
 * - SUSPENDED: access blocked, membership retained, reversible.
 * - REMOVED: terminal for this membership row; the person may be
 *   re-invited later through the standard invitation flow.
 * - Ownership transfer is atomic and preserves exactly one active owner.
 */

export class TeamAdminError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

type OwnerContext = {
  companyId: number;
};

async function requireActiveOwnerContext(
  actorUserId: number,
): Promise<OwnerContext> {
  const owner = await prisma.organizationMember.findFirst({
    where: {
      userId: actorUserId,
      role: OrganizationMemberRole.OWNER,
      status: OrganizationMemberStatus.ACTIVE,
    },
    select: { companyId: true },
  });
  if (!owner) {
    throw new TeamAdminError("UNAUTHORIZED", "Only an active owner can manage the team.");
  }
  return { companyId: owner.companyId };
}

async function loadTargetMember(companyId: number, memberId: unknown) {
  if (typeof memberId !== "number" || !Number.isInteger(memberId) || memberId <= 0) {
    throw new TeamAdminError("INVALID_MEMBER_ID");
  }

  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, companyId },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (!member) {
    throw new TeamAdminError("MEMBER_NOT_FOUND");
  }
  return member;
}

function assertNotSelf(actorUserId: number, member: { userId: number }, action: string) {
  if (member.userId === actorUserId) {
    throw new TeamAdminError("CANNOT_TARGET_SELF", `You cannot ${action} your own membership.`);
  }
}

function assertIsMember(member: { role: OrganizationMemberRole }) {
  if (member.role !== OrganizationMemberRole.MEMBER) {
    throw new TeamAdminError("TARGET_NOT_MEMBER", "Owners cannot be targeted by team admin actions.");
  }
}

export type SafeTeamMember = {
  id: number;
  userId: number;
  name: string;
  email: string;
  role: string;
  status: string;
};

function toSafe(member: {
  id: number;
  userId: number;
  role: string;
  status: string;
  user: { name: string | null; email: string };
}): SafeTeamMember {
  return {
    id: member.id,
    userId: member.userId,
    name: member.user.name ?? member.user.email,
    email: member.user.email,
    role: member.role,
    status: member.status,
  };
}

/** Suspend an ACTIVE MEMBER. Idempotent when already suspended (§42). */
export async function suspendOrganizationMemberForOwner(input: {
  actorUserId: number;
  memberId: unknown;
}): Promise<SafeTeamMember> {
  const { companyId } = await requireActiveOwnerContext(input.actorUserId);
  const member = await loadTargetMember(companyId, input.memberId);
  assertNotSelf(input.actorUserId, member, "suspend");
  assertIsMember(member);

  if (member.status === OrganizationMemberStatus.SUSPENDED) {
    return toSafe(member);
  }
  if (member.status !== OrganizationMemberStatus.ACTIVE) {
    throw new TeamAdminError("INVALID_STATUS_TRANSITION");
  }

  const updated = await prisma.organizationMember.update({
    where: { id: member.id },
    data: { status: OrganizationMemberStatus.SUSPENDED },
    include: { user: { select: { name: true, email: true } } },
  });
  return toSafe(updated);
}

/** Reinstate a SUSPENDED MEMBER. Idempotent when already active (§42). */
export async function reinstateOrganizationMemberForOwner(input: {
  actorUserId: number;
  memberId: unknown;
}): Promise<SafeTeamMember> {
  const { companyId } = await requireActiveOwnerContext(input.actorUserId);
  const member = await loadTargetMember(companyId, input.memberId);
  assertNotSelf(input.actorUserId, member, "reinstate");
  assertIsMember(member);

  if (member.status === OrganizationMemberStatus.ACTIVE) {
    return toSafe(member);
  }
  if (member.status !== OrganizationMemberStatus.SUSPENDED) {
    throw new TeamAdminError("INVALID_STATUS_TRANSITION");
  }

  const updated = await prisma.organizationMember.update({
    where: { id: member.id },
    data: { status: OrganizationMemberStatus.ACTIVE },
    include: { user: { select: { name: true, email: true } } },
  });
  return toSafe(updated);
}

/** Permanently remove a MEMBER (ACTIVE or SUSPENDED). Terminal for this row. */
export async function removeOrganizationMemberForOwner(input: {
  actorUserId: number;
  memberId: unknown;
}): Promise<SafeTeamMember> {
  const { companyId } = await requireActiveOwnerContext(input.actorUserId);
  const member = await loadTargetMember(companyId, input.memberId);
  assertNotSelf(input.actorUserId, member, "remove");
  assertIsMember(member);

  if (member.status === OrganizationMemberStatus.REMOVED) {
    return toSafe(member);
  }

  const updated = await prisma.organizationMember.update({
    where: { id: member.id },
    data: { status: OrganizationMemberStatus.REMOVED },
    include: { user: { select: { name: true, email: true } } },
  });
  return toSafe(updated);
}

/**
 * Atomically transfer ownership: target ACTIVE MEMBER becomes OWNER,
 * current owner becomes MEMBER. Exactly one active owner before and after.
 */
export async function transferOwnershipForOwner(input: {
  actorUserId: number;
  targetMemberId: unknown;
}): Promise<{ previousOwner: SafeTeamMember; newOwner: SafeTeamMember }> {
  const { companyId } = await requireActiveOwnerContext(input.actorUserId);
  const current = await loadTargetMember(companyId, input.targetMemberId);
  assertNotSelf(input.actorUserId, current, "transfer ownership to yourself");
  if (current.role !== OrganizationMemberRole.MEMBER) {
    throw new TeamAdminError("TARGET_NOT_MEMBER");
  }
  if (current.status !== OrganizationMemberStatus.ACTIVE) {
    throw new TeamAdminError("TARGET_NOT_ACTIVE", "Ownership can only transfer to an active member.");
  }

  const result = await prisma.$transaction(async (tx) => {
    // Count active owners other than the actor's own membership row.
    const actorMembership = await tx.organizationMember.findFirst({
      where: {
        userId: input.actorUserId,
        companyId,
        role: OrganizationMemberRole.OWNER,
        status: OrganizationMemberStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!actorMembership) {
      throw new TeamAdminError("UNAUTHORIZED");
    }

    const otherOwners = await tx.organizationMember.count({
      where: {
        companyId,
        role: OrganizationMemberRole.OWNER,
        status: OrganizationMemberStatus.ACTIVE,
        id: { not: actorMembership.id },
      },
    });
    if (otherOwners > 0) {
      throw new TeamAdminError(
        "MULTIPLE_OWNERS",
        "Company already has more than one active owner; transfer aborted.",
      );
    }

    // Order matters: the DB's partial unique index
    // (OrganizationMember_one_active_owner_per_company) permits only one
    // active owner per company, so we demote before promoting. Both writes
    // share one transaction — any failure rolls back atomically.
    const previousOwner = await tx.organizationMember.update({
      where: { id: actorMembership.id },
      data: { role: OrganizationMemberRole.MEMBER },
      include: { user: { select: { name: true, email: true } } },
    });

    const newOwner = await tx.organizationMember.update({
      where: { id: current.id },
      data: { role: OrganizationMemberRole.OWNER },
      include: { user: { select: { name: true, email: true } } },
    });

    return { newOwner, previousOwner };
  });

  return {
    previousOwner: toSafe(result.previousOwner),
    newOwner: toSafe(result.newOwner),
  };
}

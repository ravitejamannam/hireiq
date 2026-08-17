import {
  OrganizationMemberRole,
  OrganizationMemberStatus,
  Prisma,
} from "@prisma/client";

import { normalizeIdentityEmail } from "@/lib/auth/email-normalization";
import { generateSecureToken, hashSecureToken } from "@/lib/auth/secure-token";
import { prisma } from "@/lib/prisma";
import { deliverOrganizationInvitationEmail } from "@/lib/organizations/invitation-email";
import {
  INVITATION_MEMBER_ROLE,
  INVITATION_TTL_MS,
  OrganizationMembershipError,
  assertInviteeIsNotPrivilegedPortalUser,
  assertInvitationRoleIsMember,
  assertUserCanAcceptClientInvitation,
  validateInvitationEmail,
  validateInvitationId,
  validateInvitationToken,
} from "@/lib/validation/organization-membership-validation";

function isUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export type InviteOrganizationMemberResult = {
  invitationId: number;
  email: string;
  expiresAt: Date;
  replacedPendingInvitation: boolean;
  emailAttempted: boolean;
  emailSent: boolean;
};

export async function inviteOrganizationMemberForOwner(input: {
  actorUserId: number;
  companyId: number;
  email: unknown;
}): Promise<InviteOrganizationMemberResult> {
  const email = validateInvitationEmail(input.email);
  const companyId = input.companyId;
  const now = new Date();

  const owner = await prisma.organizationMember.findFirst({
    where: {
      userId: input.actorUserId,
      companyId,
      role: OrganizationMemberRole.OWNER,
      status: OrganizationMemberStatus.ACTIVE,
    },
    select: {
      id: true,
      companyId: true,
      company: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!owner) {
    throw new OrganizationMembershipError("Unauthorized.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
    },
  });
  assertInviteeIsNotPrivilegedPortalUser(existingUser);

  if (existingUser) {
    const activeMembership = await prisma.organizationMember.findFirst({
      where: {
        userId: existingUser.id,
        status: OrganizationMemberStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (activeMembership) {
      throw new OrganizationMembershipError(
        "This account already belongs to a company.",
      );
    }
  }

  const token = generateSecureToken();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

  let replacedPendingInvitation = false;
  let invitationId: number;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const pending = await tx.invitation.findFirst({
        where: {
          companyId,
          email,
          acceptedAt: null,
          revokedAt: null,
        },
        select: { id: true },
      });

      if (pending) {
        await tx.invitation.update({
          where: { id: pending.id },
          data: { revokedAt: now },
        });
        replacedPendingInvitation = true;
      }

      return tx.invitation.create({
        data: {
          companyId,
          email,
          role: INVITATION_MEMBER_ROLE,
          tokenHash: token.tokenHash,
          expiresAt,
          invitedByUserId: input.actorUserId,
        },
        select: { id: true },
      });
    });
    invitationId = created.id;
  } catch (error) {
    if (isUniqueConflict(error)) {
      throw new OrganizationMembershipError(
        "A pending invitation already exists for this email.",
      );
    }
    throw error;
  }

  assertInvitationRoleIsMember(INVITATION_MEMBER_ROLE);

  const delivery = await deliverOrganizationInvitationEmail({
    to: email,
    companyName: owner.company.name,
    rawToken: token.rawToken,
  });

  return {
    invitationId,
    email,
    expiresAt,
    replacedPendingInvitation,
    emailAttempted: true,
    emailSent: delivery.sent,
  };
}

export async function revokeOrganizationInvitationForOwner(input: {
  actorUserId: number;
  companyId: number;
  invitationId: unknown;
}) {
  const invitationId = validateInvitationId(input.invitationId);
  const now = new Date();

  const owner = await prisma.organizationMember.findFirst({
    where: {
      userId: input.actorUserId,
      companyId: input.companyId,
      role: OrganizationMemberRole.OWNER,
      status: OrganizationMemberStatus.ACTIVE,
    },
    select: { id: true },
  });

  if (!owner) {
    throw new OrganizationMembershipError("Unauthorized.");
  }

  const invitation = await prisma.invitation.findFirst({
    where: {
      id: invitationId,
      companyId: input.companyId,
    },
    select: {
      id: true,
      acceptedAt: true,
      revokedAt: true,
    },
  });

  if (!invitation || invitation.acceptedAt || invitation.revokedAt) {
    throw new OrganizationMembershipError("Invitation is not pending.");
  }

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { revokedAt: now },
  });

  return { invitationId: invitation.id, revoked: true as const };
}

export type AcceptOrganizationInvitationResult = {
  membershipId: number;
  companyId: number;
};

export async function acceptOrganizationInvitationForUser(input: {
  userId: number;
  token: unknown;
}): Promise<AcceptOrganizationInvitationResult> {
  const rawToken = validateInvitationToken(input.token);
  const tokenHash = hashSecureToken(rawToken);
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          companyId: true,
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          invitedByUserId: true,
        },
      });

      if (!invitation) {
        throw new OrganizationMembershipError("Invitation is invalid.");
      }

      if (invitation.revokedAt) {
        throw new OrganizationMembershipError("Invitation is no longer valid.");
      }

      if (invitation.acceptedAt) {
        throw new OrganizationMembershipError("Invitation is no longer valid.");
      }

      if (invitation.expiresAt.getTime() <= now.getTime()) {
        throw new OrganizationMembershipError("Invitation has expired.");
      }

      assertInvitationRoleIsMember(invitation.role);

      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          role: true,
          companyId: true,
          interviewerId: true,
          emailVerifiedAt: true,
        },
      });

      if (!user) {
        throw new OrganizationMembershipError("Invitation is invalid.");
      }

      assertUserCanAcceptClientInvitation(user);

      const normalizedUserEmail = normalizeIdentityEmail(user.email);
      if (normalizedUserEmail !== invitation.email) {
        throw new OrganizationMembershipError(
          "This invitation belongs to a different email address.",
        );
      }

      const company = await tx.company.findUnique({
        where: { id: invitation.companyId },
        select: { id: true },
      });

      if (!company) {
        throw new OrganizationMembershipError("Invitation is invalid.");
      }

      const activeElsewhere = await tx.organizationMember.findFirst({
        where: {
          userId: user.id,
          status: OrganizationMemberStatus.ACTIVE,
          NOT: {
            companyId: invitation.companyId,
          },
        },
        select: { id: true },
      });

      if (activeElsewhere) {
        throw new OrganizationMembershipError(
          "This account already belongs to a company.",
        );
      }

      const existingMembership = await tx.organizationMember.findUnique({
        where: {
          companyId_userId: {
            companyId: invitation.companyId,
            userId: user.id,
          },
        },
        select: {
          id: true,
          status: true,
        },
      });

      let membershipId: number;

      if (existingMembership) {
        if (existingMembership.status === OrganizationMemberStatus.ACTIVE) {
          throw new OrganizationMembershipError(
            "This account already belongs to this company.",
          );
        }

        if (existingMembership.status === OrganizationMemberStatus.SUSPENDED) {
          throw new OrganizationMembershipError(
            "This account cannot join this company.",
          );
        }

        const restored = await tx.organizationMember.update({
          where: { id: existingMembership.id },
          data: {
            role: invitation.role,
            status: OrganizationMemberStatus.ACTIVE,
            invitedByUserId: invitation.invitedByUserId,
          },
          select: { id: true },
        });
        membershipId = restored.id;
      } else {
        const created = await tx.organizationMember.create({
          data: {
            companyId: invitation.companyId,
            userId: user.id,
            role: invitation.role,
            status: OrganizationMemberStatus.ACTIVE,
            invitedByUserId: invitation.invitedByUserId,
          },
          select: { id: true },
        });
        membershipId = created.id;
      }

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: now },
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          companyId: invitation.companyId,
          emailVerifiedAt: user.emailVerifiedAt ?? now,
        },
      });

      return {
        membershipId,
        companyId: invitation.companyId,
      };
    });
  } catch (error) {
    if (isUniqueConflict(error)) {
      throw new OrganizationMembershipError(
        "This account already belongs to a company.",
      );
    }
    throw error;
  }
}

export async function previewInvitationByToken(token: unknown) {
  const rawToken = validateInvitationToken(token);
  const tokenHash = hashSecureToken(rawToken);
  const now = new Date();

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    select: {
      email: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      company: {
        select: { name: true },
      },
    },
  });

  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.revokedAt ||
    invitation.expiresAt.getTime() <= now.getTime()
  ) {
    throw new OrganizationMembershipError(
      "That invitation is invalid or can no longer be used.",
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true },
  });

  return {
    email: invitation.email,
    companyName: invitation.company.name,
    userExists: Boolean(existing),
  };
}

export async function findPendingInvitationsForEmail(email: string) {
  const normalized = normalizeIdentityEmail(email);
  const now = new Date();

  return prisma.invitation.findMany({
    where: {
      email: normalized,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      expiresAt: true,
      company: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listCompanyTeam(companyId: number) {
  const members = await prisma.organizationMember.findMany({
    where: { companyId },
    select: {
      id: true,
      role: true,
      status: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const invitations = await prisma.invitation.findMany({
    where: {
      companyId,
      acceptedAt: null,
      revokedAt: null,
    },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return { members, invitations };
}

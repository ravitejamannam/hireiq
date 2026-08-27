import { PortalRole } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { generateSecureToken, hashSecureToken } from "@/lib/auth/secure-token";
import { deliverInterviewerInvitationEmail } from "@/lib/interviewers/interviewer-invitation-email";
import {
  INTERVIEWER_INVITATION_TTL_MS,
  InterviewerInvitationError,
  validateInterviewerInviteEmail,
  validateInterviewerInviteId,
  validateInterviewerInviteToken,
} from "@/lib/interviewers/interviewer-invitation-errors";
import { prisma } from "@/lib/prisma";
import { validateBootstrapPassword } from "@/lib/validation/user-validation";
import { getPrismaErrorCode } from "@/lib/prisma-error";

function isUniqueConflict(error: unknown) {
  return (
    getPrismaErrorCode(error) === "P2002"
  );
}

export async function createInterviewerWithInvite(input: {
  actorUserId: number;
  name: string;
  category: import("@prisma/client").InterviewerCategory;
  availability: import("@prisma/client").InterviewerAvailability;
  email: unknown;
}) {
  const email = validateInterviewerInviteEmail(input.email);
  const now = new Date();

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, interviewerId: true },
  });

  if (existingUser) {
    if (existingUser.role === PortalRole.ADMIN) {
      throw new InterviewerInvitationError(
        "Admin accounts cannot be invited as interviewers.",
      );
    }
    if (existingUser.role === PortalRole.CLIENT) {
      throw new InterviewerInvitationError(
        "Client accounts cannot be invited as interviewers.",
      );
    }
    if (existingUser.role === PortalRole.INTERVIEWER) {
      throw new InterviewerInvitationError(
        "This email already has an interviewer login.",
      );
    }
  }

  const pendingElsewhere = await prisma.interviewerInvitation.findFirst({
    where: {
      email,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true },
  });

  if (pendingElsewhere) {
    throw new InterviewerInvitationError(
      "A pending interviewer invitation already exists for this email.",
    );
  }

  const token = generateSecureToken();
  const expiresAt = new Date(now.getTime() + INTERVIEWER_INVITATION_TTL_MS);

  const created = await prisma.$transaction(async (tx) => {
    const interviewer = await tx.interviewer.create({
      data: {
        name: input.name,
        category: input.category,
        availability: input.availability,
      },
      select: { id: true, name: true },
    });

    const invitation = await tx.interviewerInvitation.create({
      data: {
        interviewerId: interviewer.id,
        email,
        tokenHash: token.tokenHash,
        expiresAt,
        invitedByUserId: input.actorUserId,
      },
      select: { id: true },
    });

    return { interviewer, invitation };
  });

  const delivery = await deliverInterviewerInvitationEmail({
    to: email,
    interviewerName: created.interviewer.name,
    rawToken: token.rawToken,
  });

  return {
    interviewerId: created.interviewer.id,
    invitationId: created.invitation.id,
    email,
    expiresAt,
    emailSent: delivery.sent,
  };
}

export async function resendInterviewerInvitation(input: {
  actorUserId: number;
  interviewerId: number;
}) {
  const now = new Date();
  const interviewer = await prisma.interviewer.findUnique({
    where: { id: input.interviewerId },
    select: {
      id: true,
      name: true,
      users: {
        where: { role: PortalRole.INTERVIEWER },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!interviewer) {
    throw new InterviewerInvitationError("Interviewer not found.");
  }

  if (interviewer.users.length > 0) {
    throw new InterviewerInvitationError(
      "This interviewer already has an active login.",
    );
  }

  const pending = await prisma.interviewerInvitation.findFirst({
    where: {
      interviewerId: interviewer.id,
      acceptedAt: null,
      revokedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true },
  });

  if (!pending) {
    throw new InterviewerInvitationError(
      "No pending invitation to resend. Create a new invite.",
    );
  }

  const token = generateSecureToken();
  const expiresAt = new Date(now.getTime() + INTERVIEWER_INVITATION_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.interviewerInvitation.update({
      where: { id: pending.id },
      data: { revokedAt: now },
    });

    await tx.interviewerInvitation.create({
      data: {
        interviewerId: interviewer.id,
        email: pending.email,
        tokenHash: token.tokenHash,
        expiresAt,
        invitedByUserId: input.actorUserId,
      },
    });
  });

  const delivery = await deliverInterviewerInvitationEmail({
    to: pending.email,
    interviewerName: interviewer.name,
    rawToken: token.rawToken,
  });

  return {
    interviewerId: interviewer.id,
    email: pending.email,
    expiresAt,
    emailSent: delivery.sent,
  };
}

export async function revokeInterviewerInvitation(input: {
  invitationId: unknown;
}) {
  const invitationId = validateInterviewerInviteId(input.invitationId);
  const now = new Date();

  const invitation = await prisma.interviewerInvitation.findUnique({
    where: { id: invitationId },
    select: { id: true, acceptedAt: true, revokedAt: true },
  });

  if (!invitation || invitation.acceptedAt || invitation.revokedAt) {
    throw new InterviewerInvitationError("Invitation is not pending.");
  }

  await prisma.interviewerInvitation.update({
    where: { id: invitation.id },
    data: { revokedAt: now },
  });

  return { invitationId: invitation.id, revoked: true as const };
}

export async function previewInterviewerInvitationByToken(token: unknown) {
  const rawToken = validateInterviewerInviteToken(token);
  const tokenHash = hashSecureToken(rawToken);
  const now = new Date();

  const invitation = await prisma.interviewerInvitation.findUnique({
    where: { tokenHash },
    select: {
      email: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      interviewer: { select: { name: true } },
    },
  });

  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.revokedAt ||
    invitation.expiresAt.getTime() <= now.getTime()
  ) {
    throw new InterviewerInvitationError(
      "That invitation is invalid or can no longer be used.",
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true, role: true, interviewerId: true },
  });

  return {
    email: invitation.email,
    interviewerName: invitation.interviewer.name,
    userExists: Boolean(existing),
    existingRole: existing?.role ?? null,
    existingInterviewerId: existing?.interviewerId ?? null,
  };
}

/**
 * Create INTERVIEWER User linked 1:1 and consume the invite.
 * Invitee chooses the password. Mailbox is proven by the invite itself.
 */
export async function acceptInterviewerInvitationAndCreateLogin(input: {
  token: unknown;
  name: unknown;
  password: unknown;
}) {
  const rawToken = validateInterviewerInviteToken(input.token);
  const tokenHash = hashSecureToken(rawToken);
  const password = validateBootstrapPassword(input.password);

  if (typeof input.name !== "string" || !input.name.trim()) {
    throw new InterviewerInvitationError("Name is required.");
  }
  const name = input.name.trim();
  const passwordHash = await hashPassword(password);
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const invitation = await tx.interviewerInvitation.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          email: true,
          interviewerId: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
        },
      });

      if (!invitation) {
        throw new InterviewerInvitationError("Invitation is invalid.");
      }
      if (invitation.revokedAt || invitation.acceptedAt) {
        throw new InterviewerInvitationError(
          "Invitation is no longer valid.",
        );
      }
      if (invitation.expiresAt.getTime() <= now.getTime()) {
        throw new InterviewerInvitationError("Invitation has expired.");
      }

      const existingUser = await tx.user.findUnique({
        where: { email: invitation.email },
        select: {
          id: true,
          role: true,
          interviewerId: true,
        },
      });

      if (existingUser) {
        throw new InterviewerInvitationError(
          "An account already exists for this email. Sign in cannot attach an interviewer invite to an existing login in this flow.",
        );
      }

      const linked = await tx.user.findFirst({
        where: {
          interviewerId: invitation.interviewerId,
          role: PortalRole.INTERVIEWER,
        },
        select: { id: true },
      });

      if (linked) {
        throw new InterviewerInvitationError(
          "This interviewer profile already has a login.",
        );
      }

      const user = await tx.user.create({
        data: {
          email: invitation.email,
          name,
          role: PortalRole.INTERVIEWER,
          passwordHash,
          companyId: null,
          interviewerId: invitation.interviewerId,
          emailVerifiedAt: now,
          passwordChangedAt: now,
        },
        select: { id: true, email: true },
      });

      await tx.interviewerInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: now },
      });

      return {
        userId: user.id,
        email: user.email,
        interviewerId: invitation.interviewerId,
      };
    });
  } catch (error) {
    if (isUniqueConflict(error)) {
      throw new InterviewerInvitationError(
        "Unable to create this interviewer login.",
      );
    }
    throw error;
  }
}

/**
 * Existing INTERVIEWER user (same email, no profile yet) can attach by signing in.
 * Used when bootstrap or a partial account exists without interviewerId — rare.
 * Preferred path for new people is acceptInterviewerInvitationAndCreateLogin.
 */
export async function acceptInterviewerInvitationForExistingUser(input: {
  userId: number;
  token: unknown;
}) {
  const rawToken = validateInterviewerInviteToken(input.token);
  const tokenHash = hashSecureToken(rawToken);
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const invitation = await tx.interviewerInvitation.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          email: true,
          interviewerId: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
        },
      });

      if (!invitation) {
        throw new InterviewerInvitationError("Invitation is invalid.");
      }
      if (invitation.revokedAt || invitation.acceptedAt) {
        throw new InterviewerInvitationError(
          "Invitation is no longer valid.",
        );
      }
      if (invitation.expiresAt.getTime() <= now.getTime()) {
        throw new InterviewerInvitationError("Invitation has expired.");
      }

      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          role: true,
          interviewerId: true,
          companyId: true,
        },
      });

      if (!user) {
        throw new InterviewerInvitationError("Invitation is invalid.");
      }

      if (user.email !== invitation.email) {
        throw new InterviewerInvitationError(
          "This invitation belongs to a different email address.",
        );
      }

      if (user.role !== PortalRole.INTERVIEWER) {
        throw new InterviewerInvitationError(
          "Only interviewer accounts can accept this invitation.",
        );
      }

      if (user.interviewerId !== null) {
        if (user.interviewerId === invitation.interviewerId) {
          await tx.interviewerInvitation.update({
            where: { id: invitation.id },
            data: { acceptedAt: now },
          });
          return {
            userId: user.id,
            interviewerId: invitation.interviewerId,
          };
        }
        throw new InterviewerInvitationError(
          "This account is already linked to another interviewer profile.",
        );
      }

      if (user.companyId !== null) {
        throw new InterviewerInvitationError(
          "This account cannot join as an interviewer.",
        );
      }

      const linked = await tx.user.findFirst({
        where: {
          interviewerId: invitation.interviewerId,
          role: PortalRole.INTERVIEWER,
          NOT: { id: user.id },
        },
        select: { id: true },
      });

      if (linked) {
        throw new InterviewerInvitationError(
          "This interviewer profile already has a login.",
        );
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          interviewerId: invitation.interviewerId,
          emailVerifiedAt: now,
        },
      });

      await tx.interviewerInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: now },
      });

      return {
        userId: user.id,
        interviewerId: invitation.interviewerId,
      };
    });
  } catch (error) {
    if (isUniqueConflict(error)) {
      throw new InterviewerInvitationError(
        "Unable to accept this interviewer invitation.",
      );
    }
    throw error;
  }
}

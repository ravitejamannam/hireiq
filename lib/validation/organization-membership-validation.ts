import { PortalRole } from "@prisma/client";

import {
  isPlausibleIdentityEmail,
  normalizeIdentityEmail,
} from "@/lib/auth/email-normalization";
import { isInvitableClientRole } from "@/lib/organizations/client-portal-roles";

export class OrganizationMembershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationMembershipError";
  }
}

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export function validateInvitationEmail(email: unknown) {
  if (typeof email !== "string" || !email.trim()) {
    throw new OrganizationMembershipError("Email is invalid.");
  }

  const normalized = normalizeIdentityEmail(email);

  if (!isPlausibleIdentityEmail(normalized)) {
    throw new OrganizationMembershipError("Email is invalid.");
  }

  return normalized;
}

export function validateInvitationToken(token: unknown) {
  if (typeof token !== "string" || !token.trim()) {
    throw new OrganizationMembershipError("Invitation is invalid.");
  }

  return token.trim();
}

export function validateEmailVerificationToken(token: unknown) {
  if (typeof token !== "string" || !token.trim()) {
    throw new OrganizationMembershipError("Verification token is invalid.");
  }

  return token.trim();
}

export function validateInvitationId(id: unknown) {
  if (
    typeof id !== "number" ||
    !Number.isFinite(id) ||
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new OrganizationMembershipError(
      "Invitation ID must be a positive integer.",
    );
  }

  return id;
}

/** Invitations may create a member, HR Head, or recruiter. Never an owner. */
export function assertInvitableOrganizationRole(role: unknown) {
  if (!isInvitableClientRole(role)) {
    throw new OrganizationMembershipError(
      "Invitations cannot create an owner.",
    );
  }

  return role;
}

export function assertUserCanAcceptClientInvitation(user: {
  role: PortalRole;
  interviewerId: number | null;
}) {
  if (user.role === PortalRole.ADMIN || user.role === PortalRole.INTERVIEWER) {
    throw new OrganizationMembershipError(
      "This account cannot join a company.",
    );
  }

  if (user.role !== PortalRole.CLIENT) {
    throw new OrganizationMembershipError(
      "This account cannot join a company.",
    );
  }

  if (user.interviewerId !== null) {
    throw new OrganizationMembershipError(
      "This account cannot join a company.",
    );
  }
}

export function assertInviteeIsNotPrivilegedPortalUser(user: {
  role: PortalRole;
} | null) {
  if (!user) {
    return;
  }

  if (user.role === PortalRole.ADMIN || user.role === PortalRole.INTERVIEWER) {
    throw new OrganizationMembershipError(
      "Admin and interviewer accounts cannot be invited.",
    );
  }
}

"use server";

import { revalidatePath } from "next/cache";

import {
  requireClientPortal,
  requirePostAuthDestination,
  requireUser,
} from "@/lib/auth/authorization";
import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForCompany,
  rateLimitKeyForIp,
  rateLimitKeyForUser,
} from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";
import { createClientCompanyForUser } from "@/lib/organizations/company-onboarding";
import { createClientRequirementDraftForCompany } from "@/lib/organizations/client-requirement-draft";
import {
  consumeEmailVerificationTokenForUser,
  issueEmailVerificationTokenForUser,
} from "@/lib/organizations/email-verification-service";
import {
  acceptOrganizationInvitationForUser,
  inviteOrganizationMemberForOwner,
  listCompanyTeam,
  revokeOrganizationInvitationForOwner,
} from "@/lib/organizations/invitation-service";
import { notifyHireIqOpsOfNewCompany } from "@/lib/organizations/ops-notification";
import { deliverEmailVerificationEmail } from "@/lib/organizations/verification-email";
import { prisma } from "@/lib/prisma";
import { OrganizationMembershipError } from "@/lib/validation/organization-membership-validation";

export async function resendVerificationEmail() {
  const user = await requireUser();
  const ip = await readRequestIp();

  try {
    await consumeAuthRateLimit({
      name: "resendVerification",
      key: rateLimitKeyForUser(user.id),
    });
    await consumeAuthRateLimit({
      name: "resendVerification",
      key: rateLimitKeyForIp(ip),
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { emailVerifiedAt: true, email: true },
  });

  if (!row || row.emailVerifiedAt) {
    return {
      ok: false as const,
      error: "Email is already verified.",
    };
  }

  const issued = await issueEmailVerificationTokenForUser({ userId: user.id });
  const delivery = await deliverEmailVerificationEmail({
    to: row.email,
    rawToken: issued.rawToken,
  });

  console.info("[onboarding] verification_email_attempted", {
    userId: user.id,
    sent: delivery.sent,
    reason: delivery.sent ? "resend" : delivery.reason,
  });

  if (!delivery.sent) {
    return {
      ok: true as const,
      sent: false as const,
      reason: delivery.reason,
    };
  }

  return { ok: true as const, sent: true as const };
}

export async function createClientCompany(input: {
  name: unknown;
  industry: unknown;
  employees: unknown;
}) {
  const user = await requireUser();
  const created = await createClientCompanyForUser({
    userId: user.id,
    name: input.name,
    industry: input.industry,
    employees: input.employees,
  });

  const owner = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true },
  });

  try {
    await notifyHireIqOpsOfNewCompany({
      companyId: created.companyId,
      companyName: created.companyName,
      ownerUserId: created.ownerUserId,
      ownerEmail: owner?.email ?? "",
    });
  } catch {
    console.info("[onboarding] company_created_ops_email", {
      companyId: created.companyId,
      ownerUserId: created.ownerUserId,
      sent: false,
      reason: "provider-error",
    });
  }

  return created;
}

export async function createClientRequirementDraft(title: unknown) {
  const client = await requireClientPortal();
  const job = await createClientRequirementDraftForCompany({
    companyId: client.companyId,
    title,
  });

  try {
    revalidatePath("/client");
    revalidatePath("/client/requirements");
  } catch {
    // revalidatePath requires a Next.js request context
  }

  return job;
}

/**
 * Invite a MEMBER to the authenticated OWNER's company.
 * Company is taken from ACTIVE membership, never from the request body.
 */
export async function inviteOrganizationMember(email: unknown) {
  const client = await requireClientPortal();
  if (client.membershipRole !== "OWNER") {
    throw new OrganizationMembershipError("Unauthorized.");
  }

  await consumeAuthRateLimit({
    name: "ownerInvite",
    key: rateLimitKeyForCompany(client.companyId),
  });

  const result = await inviteOrganizationMemberForOwner({
    actorUserId: client.id,
    companyId: client.companyId,
    email,
  });

  try {
    revalidatePath("/client");
    revalidatePath("/client/team");
  } catch {
    // revalidatePath requires a Next.js request context
  }

  return {
    invitationId: result.invitationId,
    email: result.email,
    expiresAt: result.expiresAt,
    replacedPendingInvitation: result.replacedPendingInvitation,
    emailSent: result.emailSent,
  };
}

export async function revokeOrganizationInvitation(invitationId: unknown) {
  const client = await requireClientPortal();
  if (client.membershipRole !== "OWNER") {
    throw new OrganizationMembershipError("Unauthorized.");
  }

  const result = await revokeOrganizationInvitationForOwner({
    actorUserId: client.id,
    companyId: client.companyId,
    invitationId,
  });

  try {
    revalidatePath("/client");
    revalidatePath("/client/team");
  } catch {
    // revalidatePath requires a Next.js request context
  }

  return result;
}

export async function loadCompanyTeam() {
  const client = await requireClientPortal();
  if (client.membershipRole !== "OWNER") {
    throw new OrganizationMembershipError("Unauthorized.");
  }

  return listCompanyTeam(client.companyId);
}

/**
 * Accept an invitation. The raw token is the only authorization input.
 */
export async function acceptOrganizationInvitation(token: unknown) {
  const user = await requireUser();
  const ip = await readRequestIp();
  await consumeAuthRateLimit({
    name: "inviteAcceptIp",
    key: rateLimitKeyForIp(ip),
  });

  const result = await acceptOrganizationInvitationForUser({
    userId: user.id,
    token,
  });

  console.info("[onboarding] invitation_accepted", {
    userId: user.id,
    companyId: result.companyId,
  });

  return result;
}

export async function verifyEmailAddress(token: unknown) {
  const user = await requireUser();
  const ip = await readRequestIp();
  await consumeAuthRateLimit({
    name: "verifyConsumeIp",
    key: rateLimitKeyForIp(ip),
  });

  const result = await consumeEmailVerificationTokenForUser({
    userId: user.id,
    token,
  });

  console.info("[onboarding] email_verified", { userId: user.id });

  return result;
}

export async function resolvePostAuthPath() {
  return requirePostAuthDestination();
}

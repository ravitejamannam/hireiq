import { PortalRole } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { issueEmailVerificationTokenForUser } from "@/lib/organizations/email-verification-service";
import { deliverEmailVerificationEmail } from "@/lib/organizations/verification-email";
import {
  UserValidationError,
  validateBootstrapPassword,
} from "@/lib/validation/user-validation";
import {
  isPlausibleIdentityEmail,
  normalizeIdentityEmail,
} from "@/lib/auth/email-normalization";
import { getPrismaErrorCode } from "@/lib/prisma-error";

export class SignupError extends Error {
  constructor(message = "Unable to create your account with those details.") {
    super(message);
    this.name = "SignupError";
  }
}

const GENERIC_SIGNUP_ERROR = "Unable to create your account with those details.";

function validateSignupName(name: unknown) {
  if (typeof name !== "string" || !name.trim()) {
    throw new SignupError(GENERIC_SIGNUP_ERROR);
  }

  return name.trim();
}

function validateSignupEmail(email: unknown) {
  if (typeof email !== "string" || !email.trim()) {
    throw new SignupError(GENERIC_SIGNUP_ERROR);
  }

  const normalized = normalizeIdentityEmail(email);
  if (!isPlausibleIdentityEmail(normalized)) {
    throw new SignupError(GENERIC_SIGNUP_ERROR);
  }

  return normalized;
}

function validateSignupPassword(password: unknown) {
  try {
    return validateBootstrapPassword(password);
  } catch (error) {
    if (error instanceof UserValidationError) {
      throw new SignupError(GENERIC_SIGNUP_ERROR);
    }
    throw error;
  }
}

export type RegisterClientAccountResult = {
  userId: number;
  email: string;
  verificationEmailSent: boolean;
};

export async function registerClientAccount(input: {
  name: unknown;
  email: unknown;
  password: unknown;
}): Promise<RegisterClientAccountResult> {
  const name = validateSignupName(input.name);
  const email = validateSignupEmail(input.email);
  const password = validateSignupPassword(input.password);
  const passwordHash = await hashPassword(password);

  let userId: number;

  try {
    const created = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: PortalRole.CLIENT,
        companyId: null,
        emailVerifiedAt: null,
      },
      select: {
        id: true,
        email: true,
      },
    });
    userId = created.id;
  } catch (error) {
    if (
      getPrismaErrorCode(error) === "P2002"
    ) {
      throw new SignupError(GENERIC_SIGNUP_ERROR);
    }
    throw error;
  }

  console.info("[onboarding] signup_completed", { userId });

  const issued = await issueEmailVerificationTokenForUser({ userId });
  const delivery = await deliverEmailVerificationEmail({
    to: email,
    rawToken: issued.rawToken,
  });

  console.info("[onboarding] verification_email_attempted", {
    userId,
    sent: delivery.sent,
    reason: delivery.sent ? "sent" : delivery.reason,
  });

  return {
    userId,
    email,
    verificationEmailSent: delivery.sent,
  };
}

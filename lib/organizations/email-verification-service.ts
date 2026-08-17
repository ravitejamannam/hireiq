import { Prisma } from "@prisma/client";

import { normalizeIdentityEmail } from "@/lib/auth/email-normalization";
import { generateSecureToken, hashSecureToken } from "@/lib/auth/secure-token";
import { prisma } from "@/lib/prisma";
import {
  EMAIL_VERIFICATION_TTL_MS,
  OrganizationMembershipError,
  validateEmailVerificationToken,
} from "@/lib/validation/organization-membership-validation";

function isUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export type IssuedEmailVerificationToken = {
  tokenId: number;
  expiresAt: Date;
  rawToken: string;
};

export async function issueEmailVerificationTokenForUser(input: {
  userId: number;
}): Promise<IssuedEmailVerificationToken> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
    },
  });

  if (!user) {
    throw new OrganizationMembershipError("User not found.");
  }

  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
  const email = normalizeIdentityEmail(user.email);
  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.updateMany({
      where: {
        userId: user.id,
        consumedAt: null,
      },
      data: {
        consumedAt: now,
      },
    });

    return tx.emailVerificationToken.create({
      data: {
        userId: user.id,
        email,
        tokenHash: token.tokenHash,
        expiresAt,
      },
      select: { id: true },
    });
  });

  return {
    tokenId: created.id,
    expiresAt,
    rawToken: token.rawToken,
  };
}

export async function consumeEmailVerificationTokenForUser(input: {
  userId: number;
  token: unknown;
}) {
  const rawToken = validateEmailVerificationToken(input.token);
  const tokenHash = hashSecureToken(rawToken);
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const record = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          email: true,
          expiresAt: true,
          consumedAt: true,
        },
      });

      if (!record) {
        throw new OrganizationMembershipError("Verification token is invalid.");
      }

      if (record.consumedAt) {
        throw new OrganizationMembershipError(
          "Verification token is no longer valid.",
        );
      }

      if (record.expiresAt.getTime() <= now.getTime()) {
        throw new OrganizationMembershipError("Verification token has expired.");
      }

      if (record.userId !== input.userId) {
        throw new OrganizationMembershipError("Verification token is invalid.");
      }

      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
        },
      });

      if (!user) {
        throw new OrganizationMembershipError("Verification token is invalid.");
      }

      if (normalizeIdentityEmail(user.email) !== record.email) {
        throw new OrganizationMembershipError(
          "Verification token belongs to a different email address.",
        );
      }

      await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: now },
      });

      await tx.emailVerificationToken.update({
        where: { id: record.id },
        data: { consumedAt: now },
      });

      return { verified: true as const, userId: user.id };
    });
  } catch (error) {
    if (isUniqueConflict(error)) {
      throw new OrganizationMembershipError(
        "Verification token is no longer valid.",
      );
    }
    throw error;
  }
}

import { } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { generateSecureToken, hashSecureToken } from "@/lib/auth/secure-token";
import { prisma } from "@/lib/prisma";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { sendOutboundEmail } from "@/lib/communication/email-transport";
import {
  isPlausibleIdentityEmail,
  normalizeIdentityEmail,
} from "@/lib/auth/email-normalization";
import { validateBootstrapPassword } from "@/lib/validation/user-validation";
import { getPrismaErrorCode } from "@/lib/prisma-error";

/**
 * Password reset updates passwordHash and consumes reset tokens.
 * Existing Auth.js JWTs remain valid until they expire. T80 does not
 * introduce passwordChangedAt or session revocation.
 */
export class PasswordResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordResetError";
  }
}

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const GENERIC_PASSWORD_RESET_REQUEST =
  "If an account exists for this email, you'll receive instructions.";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function deliverPasswordResetEmail(input: {
  to: string;
  rawToken: string;
}) {
  const baseUrl = getPublicAppUrl();
  const resetPath = `/reset-password/${encodeURIComponent(input.rawToken)}`;
  const ctaUrl = baseUrl ? `${baseUrl}${resetPath}` : null;
  const subject = "HireIQ: Reset your password";
  const ctaLine = ctaUrl
    ? `Reset your password: ${ctaUrl}`
    : "Open the password reset link from this email after signing in is not required.";

  const text = [
    "A password reset was requested for your HireIQ account.",
    "",
    ctaLine,
    "",
    "This link expires. If you did not request a reset, you can ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <p>A password reset was requested for your HireIQ account.</p>
      ${
        ctaUrl
          ? `<p><a href="${escapeHtml(ctaUrl)}">Reset password</a></p>`
          : `<p>Use the password reset link from this email.</p>`
      }
      <p style="color: #6b7280; font-size: 12px;">This link expires. If you did not request a reset, you can ignore this email.</p>
    </div>
  `.trim();

  return sendOutboundEmail({
    to: input.to,
    subject,
    text,
    html,
  });
}

export async function requestPasswordResetForEmail(email: unknown) {
  if (typeof email !== "string" || !email.trim()) {
    return { accepted: true as const };
  }

  const normalized = normalizeIdentityEmail(email);
  if (!isPlausibleIdentityEmail(normalized)) {
    return { accepted: true as const };
  }

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, email: true },
  });

  if (!user) {
    return { accepted: true as const };
  }

  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        consumedAt: null,
      },
      data: { consumedAt: now },
    });

    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: token.tokenHash,
        expiresAt,
      },
    });
  });

  const delivery = await deliverPasswordResetEmail({
    to: user.email,
    rawToken: token.rawToken,
  });

  console.info("[onboarding] password_reset_email_attempted", {
    userId: user.id,
    sent: delivery.sent,
    reason: delivery.sent ? "sent" : delivery.reason,
  });

  return { accepted: true as const };
}

export async function resetPasswordWithToken(input: {
  token: unknown;
  password: unknown;
}) {
  if (typeof input.token !== "string" || !input.token.trim()) {
    throw new PasswordResetError("That reset link is invalid or has expired.");
  }

  let password: string;
  try {
    password = validateBootstrapPassword(input.password);
  } catch {
    throw new PasswordResetError("That reset link is invalid or has expired.");
  }

  const tokenHash = hashSecureToken(input.token.trim());
  const now = new Date();
  const passwordHash = await hashPassword(password);

  try {
    await prisma.$transaction(async (tx) => {
      const record = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          consumedAt: true,
        },
      });

      if (!record || record.consumedAt) {
        throw new PasswordResetError(
          "That reset link is invalid or has expired.",
        );
      }

      if (record.expiresAt.getTime() <= now.getTime()) {
        throw new PasswordResetError(
          "That reset link is invalid or has expired.",
        );
      }

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });

      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { consumedAt: now },
      });

      await tx.passwordResetToken.updateMany({
        where: {
          userId: record.userId,
          consumedAt: null,
          id: { not: record.id },
        },
        data: { consumedAt: now },
      });
    });
  } catch (error) {
    if (
      getPrismaErrorCode(error) === "P2002"
    ) {
      throw new PasswordResetError(
        "That reset link is invalid or has expired.",
      );
    }
    throw error;
  }

  return { reset: true as const };
}

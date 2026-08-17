"use server";

import {
  GENERIC_PASSWORD_RESET_REQUEST,
  PasswordResetError,
  requestPasswordResetForEmail,
  resetPasswordWithToken,
} from "@/lib/auth/password-reset";
import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForEmail,
  rateLimitKeyForIp,
} from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";
import { normalizeIdentityEmail } from "@/lib/auth/email-normalization";

export async function requestPasswordReset(email: unknown) {
  const ip = await readRequestIp();
  const normalized =
    typeof email === "string" ? normalizeIdentityEmail(email) : "invalid";

  try {
    await consumeAuthRateLimit({
      name: "passwordResetEmail",
      key: rateLimitKeyForEmail(normalized),
    });
    await consumeAuthRateLimit({
      name: "passwordResetIp",
      key: rateLimitKeyForIp(ip),
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { message: GENERIC_PASSWORD_RESET_REQUEST };
    }
    throw error;
  }

  await requestPasswordResetForEmail(email);
  return { message: GENERIC_PASSWORD_RESET_REQUEST };
}

export async function resetPassword(input: {
  token: unknown;
  password: unknown;
}) {
  const ip = await readRequestIp();

  try {
    await consumeAuthRateLimit({
      name: "passwordResetConsumeIp",
      key: rateLimitKeyForIp(ip),
    });
    await resetPasswordWithToken(input);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { ok: false as const, error: error.message };
    }
    if (error instanceof PasswordResetError) {
      return { ok: false as const, error: error.message };
    }
    return {
      ok: false as const,
      error: "That reset link is invalid or has expired.",
    };
  }
}

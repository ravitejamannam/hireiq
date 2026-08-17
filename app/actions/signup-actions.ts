"use server";

import { signIn } from "@/auth";

import {
  registerClientAccount,
  SignupError,
} from "@/lib/auth/signup-service";
import { normalizeIdentityEmail } from "@/lib/auth/email-normalization";
import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForEmail,
  rateLimitKeyForIp,
} from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";
import { previewInvitationByToken } from "@/lib/organizations/invitation-service";

export async function signUpClient(input: {
  name: unknown;
  email: unknown;
  password: unknown;
}) {
  const ip = await readRequestIp();
  const email =
    typeof input.email === "string" ? normalizeIdentityEmail(input.email) : "";

  try {
    await consumeAuthRateLimit({
      name: "signupEmail",
      key: rateLimitKeyForEmail(email || "invalid"),
    });
    await consumeAuthRateLimit({
      name: "signupIp",
      key: rateLimitKeyForIp(ip),
    });

    const created = await registerClientAccount(input);

    await signIn("credentials", {
      email: created.email,
      password: typeof input.password === "string" ? input.password : "",
      redirect: false,
    });

    return {
      ok: true as const,
      verificationEmailSent: created.verificationEmailSent,
    };
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { ok: false as const, error: error.message };
    }
    if (error instanceof SignupError) {
      return { ok: false as const, error: error.message };
    }
    return {
      ok: false as const,
      error: "Unable to create your account with those details.",
    };
  }
}

export async function signUpClientFromInvitation(input: {
  token: unknown;
  name: unknown;
  password: unknown;
}) {
  const ip = await readRequestIp();

  try {
    const preview = await previewInvitationByToken(input.token);

    await consumeAuthRateLimit({
      name: "signupEmail",
      key: rateLimitKeyForEmail(preview.email),
    });
    await consumeAuthRateLimit({
      name: "signupIp",
      key: rateLimitKeyForIp(ip),
    });

    const created = await registerClientAccount({
      name: input.name,
      email: preview.email,
      password: input.password,
    });

    await signIn("credentials", {
      email: created.email,
      password: typeof input.password === "string" ? input.password : "",
      redirect: false,
    });

    return {
      ok: true as const,
      verificationEmailSent: created.verificationEmailSent,
    };
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { ok: false as const, error: error.message };
    }
    if (error instanceof SignupError) {
      return { ok: false as const, error: error.message };
    }
    return {
      ok: false as const,
      error: "Unable to create your account with those details.",
    };
  }
}

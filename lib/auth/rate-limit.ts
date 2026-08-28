import { } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getPrismaErrorCode } from "@/lib/prisma-error";

export class RateLimitError extends Error {
  constructor(message = "Too many attempts. Try again later.") {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Windowed counters for public auth surfaces.
 * PostgreSQL-backed, multi-instance safe. Do not use an in-memory map.
 * Keys are opaque (email/ip/user). Limits are per window.
 *
 * Approximate production limits:
 * - signup: 5/hour/email, 10/hour/IP
 * - login: 10/15m/email, 30/15m/IP
 * - resend verification: 3/15m
 * - password reset request: 5/hour/email, 10/hour/IP
 * - token consume / invite accept: 20/15m/IP
 * - owner invites: 20/hour/company
 */
export const AUTH_RATE_LIMITS = {
  signupEmail: { windowMs: 60 * 60 * 1000, max: 5 },
  signupIp: { windowMs: 60 * 60 * 1000, max: 10 },
  loginEmail: { windowMs: 15 * 60 * 1000, max: 10 },
  loginIp: { windowMs: 15 * 60 * 1000, max: 30 },
  resendVerification: { windowMs: 15 * 60 * 1000, max: 3 },
  passwordResetEmail: { windowMs: 60 * 60 * 1000, max: 5 },
  passwordResetIp: { windowMs: 60 * 60 * 1000, max: 10 },
  verifyConsumeIp: { windowMs: 15 * 60 * 1000, max: 20 },
  inviteAcceptIp: { windowMs: 15 * 60 * 1000, max: 20 },
  passwordResetConsumeIp: { windowMs: 15 * 60 * 1000, max: 20 },
  ownerInvite: { windowMs: 60 * 60 * 1000, max: 20 },
  interviewerInvite: { windowMs: 60 * 60 * 1000, max: 20 },
  aiJobDescriptionUser: { windowMs: 60 * 60 * 1000, max: 10 },
  aiJobDescriptionJob: { windowMs: 60 * 60 * 1000, max: 10 },
  hostedApplyGetIp: { windowMs: 15 * 60 * 1000, max: 300 },
  hostedApplyPostIp: { windowMs: 60 * 60 * 1000, max: 10 },
  hostedApplyPostTokenIp: { windowMs: 60 * 60 * 1000, max: 5 },
  hostedApplyPostEmailDistribution: { windowMs: 60 * 60 * 1000, max: 3 },
  assessmentGetIp: { windowMs: 15 * 60 * 1000, max: 300 },
  assessmentPostIp: { windowMs: 60 * 60 * 1000, max: 20 },
  assessmentPostTokenIp: { windowMs: 60 * 60 * 1000, max: 8 },
  offerAcceptIp: { windowMs: 15 * 60 * 1000, max: 20 },
  scheduleBookIp: { windowMs: 15 * 60 * 1000, max: 20 },
  apiKeyIp: { windowMs: 15 * 60 * 1000, max: 120 },
  apiKeyToken: { windowMs: 15 * 60 * 1000, max: 60 },
  linkedinWebhookIp: { windowMs: 15 * 60 * 1000, max: 60 },
  indeedWebhookIp: { windowMs: 15 * 60 * 1000, max: 60 },
  aiCandidateIntelligenceUser: { windowMs: 60 * 60 * 1000, max: 10 },
  aiCandidateIntelligenceCandidate: { windowMs: 60 * 60 * 1000, max: 10 },
} as const;

export type AuthRateLimitName = keyof typeof AUTH_RATE_LIMITS;

const DEV_SKIP_GET_LIMITS = new Set<AuthRateLimitName>([
  "hostedApplyGetIp",
  "assessmentGetIp",
]);

function windowStartFor(windowMs: number, now = new Date()) {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export async function consumeAuthRateLimit(input: {
  name: AuthRateLimitName;
  key: string;
}) {
  if (
    process.env.NODE_ENV !== "production" &&
    DEV_SKIP_GET_LIMITS.has(input.name)
  ) {
    return;
  }

  const spec = AUTH_RATE_LIMITS[input.name];
  const windowStart = windowStartFor(spec.windowMs);
  const key = `${input.name}:${input.key}`;

  try {
    const row = await prisma.authRateLimit.upsert({
      where: {
        key_windowStart: {
          key,
          windowStart,
        },
      },
      create: {
        key,
        windowStart,
        count: 1,
      },
      update: {
        count: {
          increment: 1,
        },
      },
      select: {
        count: true,
      },
    });

    if (row.count > spec.max) {
      throw new RateLimitError();
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }

    if (
      getPrismaErrorCode(error) === "P2002"
    ) {
      const raced = await prisma.authRateLimit.update({
        where: {
          key_windowStart: {
            key,
            windowStart,
          },
        },
        data: {
          count: {
            increment: 1,
          },
        },
        select: {
          count: true,
        },
      });

      if (raced.count > spec.max) {
        throw new RateLimitError();
      }

      return;
    }

    throw error;
  }
}

export function rateLimitKeyForEmail(email: string) {
  return `email:${email}`;
}

export function rateLimitKeyForIp(ip: string) {
  return `ip:${ip || "unknown"}`;
}

export function rateLimitKeyForUser(userId: number) {
  return `user:${userId}`;
}

export function rateLimitKeyForCompany(companyId: number) {
  return `company:${companyId}`;
}

export function rateLimitKeyForJob(jobId: number) {
  return `job:${jobId}`;
}

export function rateLimitKeyForCandidate(candidateId: number) {
  return `candidate:${candidateId}`;
}

export function rateLimitKeyForDigest(kind: string, digest: string) {
  return `${kind}:${digest}`;
}

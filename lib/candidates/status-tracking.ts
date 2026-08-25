import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { generateSecureToken } from "@/lib/auth/secure-token";

/**
 * Candidate status tracking (T116).
 *
 * Every application gets a permanent, unguessable status URL at ingestion.
 * The candidate sees their pipeline position in real-time — no login
 * required. The token is hash-only persisted; raw value is shown to the
 * candidate exactly once and embedded in their hosted-apply confirmation.
 */

export class StatusTrackingError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Generate a status token for an application (idempotent). */
export async function ensureStatusToken(
  applicationId: number,
): Promise<string> {
  const existing = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { statusTokenHash: true },
  });

  // Already has one — can't recover the raw token (hash-only).
  if (existing?.statusTokenHash) {
    throw new StatusTrackingError("TOKEN_ALREADY_EXISTS");
  }

  const { rawToken, tokenHash } = generateSecureToken();
  await prisma.application.update({
    where: { id: applicationId },
    data: { statusTokenHash: tokenHash },
  });
  return rawToken;
}

export function buildStatusUrl(token: string): string {
  const origin =
    process.env.APP_URL?.trim() || process.env.AUTH_URL?.trim() || "";
  return `${origin}/status/${token}`;
}

/** Resolve a status token to its application id, or null when invalid. */
export async function resolveStatusToken(
  rawToken: string,
): Promise<number | null> {
  if (!rawToken || typeof rawToken !== "string") return null;
  const tokenHash = hashToken(rawToken);
  const app = await prisma.application.findFirst({
    where: { statusTokenHash: tokenHash },
    select: { id: true },
  });
  return app?.id ?? null;
}

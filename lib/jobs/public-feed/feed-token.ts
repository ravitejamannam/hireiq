import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless, HMAC-signed feed tokens (T96 Phase 1).
 *
 * Purpose: authorize third-party job-board crawlers to fetch a company's
 * public XML job feed without storing per-partner rows.
 *
 * Token format: `${companyId}.${hmacBase64url}`
 * - Signature covers companyId + fixed purpose string so a feed token can
 *   never be replayed as another credential class.
 * - Verification is constant-time.
 *
 * Revocation semantics: rotating FEED_SIGNING_KEY (or AUTH_SECRET when no
 * dedicated key is configured) revokes all feed tokens at once. This is a
 * documented v1 limitation; per-partner revocation requires persisted
 * hashed tokens (same pattern as ApplyToken) if/when a ticket asks for it.
 */

const PURPOSE = "hireiq.public-feed.v1";

function signingKey(): string {
  const dedicated = process.env.FEED_SIGNING_KEY;
  const secret = dedicated && dedicated.trim() ? dedicated : process.env.AUTH_SECRET;
  if (!secret || !secret.trim()) {
    // Fail closed: no signature material means no verifiable feeds.
    throw new Error("FEED_SIGNING_KEY_OR_AUTH_SECRET_REQUIRED");
  }
  return secret;
}

export class FeedTokenError extends Error {}

function sign(companyId: number): string {
  return createHmac("sha256", signingKey())
    .update(`${PURPOSE}:${companyId}`)
    .digest("base64url");
}

export function generateFeedToken(companyId: number): string {
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new FeedTokenError("INVALID_COMPANY_ID");
  }
  return `${companyId}.${sign(companyId)}`;
}

export function verifyFeedToken(token: unknown): number | null {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const rawCompanyId = token.slice(0, dot);
  const givenSignature = token.slice(dot + 1);
  if (!/^\d+$/.test(rawCompanyId)) return null;

  const companyId = Number.parseInt(rawCompanyId, 10);
  let expected: Buffer;
  try {
    expected = Buffer.from(sign(companyId), "utf8");
  } catch {
    return null;
  }

  const given = Buffer.from(givenSignature, "utf8");
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(given, expected)) return null;

  return companyId;
}

/** Stable ETag for feed payloads without leaking content timestamps. */
export function feedETag(body: string): string {
  return `"${createHash("sha256").update(body, "utf8").digest("hex")}"`;
}

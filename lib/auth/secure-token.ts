import { createHash, randomBytes } from "node:crypto";

const RAW_TOKEN_BYTES = 32;

export type GeneratedSecureToken = {
  rawToken: string;
  tokenHash: string;
};

/**
 * 256-bit URL-safe token. Store only SHA-256(tokenHash).
 * The raw token must not be persisted, logged, or sent to analytics.
 */
export function generateSecureToken(): GeneratedSecureToken {
  const rawToken = randomBytes(RAW_TOKEN_BYTES).toString("base64url");
  return {
    rawToken,
    tokenHash: hashSecureToken(rawToken),
  };
}

export function hashSecureToken(rawToken: string) {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

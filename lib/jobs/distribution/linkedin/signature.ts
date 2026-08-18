import { createHmac, timingSafeEqual } from "node:crypto";

export const LINKEDIN_SIGNATURE_HEADER = "x-linkedin-signature";

export function readLinkedInWebhookSecret() {
  const secret = process.env.LINKEDIN_WEBHOOK_SECRET?.trim();
  return secret ? secret : null;
}

export function computeLinkedInWebhookSignature(
  rawBody: string,
  secret: string,
) {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * Constant-time compare of hex HMAC signatures.
 * Does not parse JSON before verification.
 */
export function linkedInSignaturesMatch(
  provided: string | null,
  expected: string,
) {
  if (!provided) {
    return false;
  }

  const left = Buffer.from(provided.trim().toLowerCase());
  const right = Buffer.from(expected.toLowerCase());
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }

  return timingSafeEqual(left, right);
}

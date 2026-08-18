import { createHmac, timingSafeEqual } from "node:crypto";

export const INDEED_SIGNATURE_HEADER = "x-indeed-signature";

export function readIndeedApplyWebhookSecret() {
  const secret = process.env.INDEED_APPLY_WEBHOOK_SECRET?.trim();
  return secret ? secret : null;
}

/**
 * Indeed Apply HMAC-SHA1 of the exact raw JSON body.
 * Digest encoding is Base64 (Indeed Apply convention).
 */
export function computeIndeedApplySignature(rawBody: string, secret: string) {
  return createHmac("sha1", secret).update(rawBody, "utf8").digest("base64");
}

/**
 * Constant-time compare of Indeed Apply signatures.
 * Does not parse JSON before verification.
 */
export function indeedSignaturesMatch(
  provided: string | null,
  expected: string,
) {
  if (!provided) {
    return false;
  }

  const left = Buffer.from(provided.trim());
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }

  return timingSafeEqual(left, right);
}

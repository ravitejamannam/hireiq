import { createHash } from "node:crypto";

/**
 * SHA-256 of UTF-8 inline evidence text.
 * Integrity only. Not identity. Not email hashing.
 */
export function hashEvidenceInlineText(inlineText: string) {
  return createHash("sha256").update(inlineText, "utf8").digest("hex");
}

export function hashEvidenceInlineTextOrNull(inlineText: string | null) {
  if (!inlineText) {
    return null;
  }
  return hashEvidenceInlineText(inlineText);
}

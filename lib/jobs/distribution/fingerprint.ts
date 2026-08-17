import { createHash, randomBytes } from "node:crypto";

import type { PublicDistributionPayload } from "@/lib/jobs/distribution/payload";

export function fingerprintPublicPayload(payload: PublicDistributionPayload) {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function newIdempotencyKey(prefix: string) {
  return `${prefix}:${randomBytes(16).toString("hex")}`;
}

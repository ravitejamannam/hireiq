import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/authorization";

/**
 * Public API keys (T112 Phase 12).
 *
 * Format: `hireiq_<companyId>_<24-byte base64url suffix>`
 * - companyId is embedded for O(1) scoping; the suffix is high-entropy.
 * - Only SHA-256(full key) is persisted; raw keys are shown exactly once.
 * - Revocation is instant via revokedAt.
 */

const KEY_PREFIX = "hireiq";

export class ApiTokenError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function hashKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

/** ADMIN-only: mint an API key and return the raw value exactly once. */
export async function createApiTokenForCompany(input: {
  companyId: number;
  name: unknown;
}): Promise<{ id: number; name: string; apiKey: string }> {
  await requireAdmin();

  const name =
    typeof input.name === "string" && input.name.trim()
      ? input.name.trim().slice(0, 80)
      : "Default key";
  const rawSuffix = randomBytes(24).toString("base64url");
  const apiKey = `${KEY_PREFIX}_${input.companyId}_${rawSuffix}`;

  const row = await prisma.apiToken.create({
    data: {
      companyId: input.companyId,
      name,
      tokenHash: hashKey(apiKey),
    },
    select: { id: true, name: true },
  });

  return { id: row.id, name: row.name, apiKey };
}

/**
 * Resolve a Bearer API key to its company id, or null when invalid/revoked.
 * Constant-time hash comparison; lastUsedAt touched best-effort.
 */
export async function resolveCompanyFromApiKey(
  authHeader: string | null,
): Promise<number | null> {
  if (!authHeader) return null;
  // Accept both raw keys and standard Bearer headers.
  const value = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();
  if (!value.startsWith(`${KEY_PREFIX}_`)) return null;

  const rest = value.slice(KEY_PREFIX.length + 1);
  const sep = rest.indexOf("_");
  if (sep <= 0) return null;

  const companyId = Number.parseInt(rest.slice(0, sep), 10);
  const suffix = rest.slice(sep + 1);
  if (!Number.isInteger(companyId) || companyId <= 0 || !suffix) return null;

  const apiKey = `${KEY_PREFIX}_${companyId}_${suffix}`;
  const tokenHash = hashKey(apiKey);

  const row = await prisma.apiToken.findFirst({
    where: { tokenHash, revokedAt: null },
    select: { id: true, companyId: true },
  });
  if (!row || row.companyId !== companyId) return null;

  prisma.apiToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return row.companyId;
}

"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, AuthorizationError } from "@/lib/auth/authorization";
import { createApiTokenForCompany } from "@/lib/api/api-keys";
import { prisma } from "@/lib/prisma";

/**
 * T140 (audit fix): API token create/revoke UI actions.
 * Restores functionality lost when ApiTokenManager became display-only.
 */

export type CreateTokenResult =
  | { ok: true; apiKey: string; name: string }
  | { ok: false; error: string };

export async function createApiTokenAction(
  rawName: string,
): Promise<CreateTokenResult> {
  let companyId: number | null;
  try {
    const admin = await requireAdmin();
    companyId = admin.companyId;
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: "Admin access required." };
    throw error;
  }
  if (!companyId) return { ok: false, error: "No workspace found for this admin." };

  const result = await createApiTokenForCompany({ companyId, name: rawName });
  revalidatePath("/dashboard/integrations");
  return { ok: true, apiKey: result.apiKey, name: result.name };
}

export async function revokeApiTokenAction(
  tokenId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let companyId: number | null;
  try {
    const admin = await requireAdmin();
    companyId = admin.companyId;
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: "Admin access required." };
    throw error;
  }
  if (!companyId) return { ok: false, error: "No workspace found." };

  // Tenant guard: only revoke tokens belonging to the caller's company.
  await prisma.apiToken.updateMany({
    where: { id: tokenId, companyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/dashboard/integrations");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/authorization";

/**
 * Server actions for API token management (ADMIN only).
 */

export async function listApiTokens(companyId: number) {
  await requireAdmin();
  const rows = await prisma.apiToken.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    revoked: r.revokedAt !== null,
  }));
}

export async function revokeApiToken(tokenId: number, companyId: number) {
  await requireAdmin();
  await prisma.apiToken.updateMany({
    where: { id: tokenId, companyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/dashboard/integrations");
}

export async function createApiToken(companyId: number, name: string): Promise<{ apiKey: string } | { error: string }> {
  const res = await fetch(`${process.env.APP_URL ?? "http://localhost:4000"}/api/v1/tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: "",
    },
    body: JSON.stringify({ companyId, name }),
  });
  return res.json();
}

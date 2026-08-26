"use server";

import { randomBytes } from "crypto";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/authorization";
import { encryptCredentialSecret } from "@/lib/crypto/credential-encryption";
import { prisma } from "@/lib/prisma";

/**
 * Server actions for partner webhook subscription management (T119).
 * ADMIN only. Secrets are generated here and returned exactly once.
 */

export type WebhookSubscriptionView = {
  id: number;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
};

export async function listWebhookSubscriptions(
  companyId: number,
): Promise<WebhookSubscriptionView[]> {
  await requireAdmin();
  const rows = await prisma.partnerWebhookSubscription.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: { id: true, url: true, events: true, active: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    events: r.events,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function createWebhookSubscription(input: {
  companyId: number;
  url: string;
  events: string[];
}): Promise<{ ok: true; signingSecret: string } | { ok: false; error: string }> {
  await requireAdmin();

  const url = input.url.trim();
  if (!/^https:\/\/.+/i.test(url)) {
    return { ok: false, error: "URL must be an https:// endpoint." };
  }
  if (input.events.length === 0) {
    return { ok: false, error: "Select at least one event." };
  }

  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  try {
    await prisma.partnerWebhookSubscription.create({
      data: {
        companyId: input.companyId,
        url,
        events: input.events,
        secretEnc: encryptCredentialSecret(secret),
      },
    });
  } catch {
    return { ok: false, error: "Could not create subscription." };
  }

  revalidatePath("/dashboard/integrations");
  return { ok: true, signingSecret: secret };
}

export async function toggleWebhookSubscription(
  subscriptionId: number,
  companyId: number,
  active: boolean,
): Promise<void> {
  await requireAdmin();
  await prisma.partnerWebhookSubscription.updateMany({
    where: { id: subscriptionId, companyId },
    data: { active },
  });
  revalidatePath("/dashboard/integrations");
}

export async function deleteWebhookSubscription(
  subscriptionId: number,
  companyId: number,
): Promise<void> {
  await requireAdmin();
  await prisma.partnerWebhookSubscription.deleteMany({
    where: { id: subscriptionId, companyId },
  });
  revalidatePath("/dashboard/integrations");
}

"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { stopQueuedAiEvaluation } from "@/lib/ai/opt-out";
import { prisma } from "@/lib/prisma";

function hashToken(rawToken: string) {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

async function applicationIdForToken(rawToken: string) {
  if (!rawToken) return null;
  const application = await prisma.application.findFirst({
    where: { statusTokenHash: hashToken(rawToken) },
    select: { id: true },
  });
  return application?.id ?? null;
}

export async function optOutOfAiEvaluation(token: string) {
  const id = await applicationIdForToken(token);
  if (!id) return;
  await prisma.application.update({
    where: { id },
    data: { aiEvaluationOptOut: true, aiOptOutAt: new Date() },
  });
  await stopQueuedAiEvaluation(id);
  revalidatePath(`/status/${token}`);
}

export async function requestHumanReview(token: string) {
  const id = await applicationIdForToken(token);
  if (!id) return;
  await prisma.application.update({
    where: { id },
    data: { humanReviewRequestedAt: new Date() },
  });
  revalidatePath(`/status/${token}`);
}

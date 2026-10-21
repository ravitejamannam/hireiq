"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { stopQueuedAiEvaluation } from "@/lib/ai/opt-out";
import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";

const STATUS_PAGE_REASON = "via candidate status page";

function hashToken(rawToken: string) {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** The status link is the credential: it identifies one application, and the company comes from that application. */
async function applicationForToken(rawToken: string) {
  if (!rawToken) return null;
  return prisma.application.findFirst({
    where: { statusTokenHash: hashToken(rawToken) },
    select: { id: true, companyId: true },
  });
}

/**
 * Both actions change the application and write the audit row in one transaction, so a failed audit write rolls the
 * change back and the error reaches the caller. The actor is the status link (role CANDIDATE_TOKEN, no user id).
 */
export async function optOutOfAiEvaluation(token: string) {
  const application = await applicationForToken(token);
  if (!application) return;
  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: application.id },
      data: { aiPreference: "REFUSED", aiPreferenceSource: "STATUS_PAGE", aiPreferenceAt: new Date(), aiOptOutAt: new Date() },
    });
    await writeAuditLog(tx, {
      actorUserId: null,
      actorRole: "CANDIDATE_TOKEN",
      companyId: application.companyId,
      action: "AI_OPT_OUT",
      targetType: "APPLICATION",
      targetId: application.id,
      reason: STATUS_PAGE_REASON,
    });
  });
  await stopQueuedAiEvaluation(application.id);
  revalidatePath(`/status/${token}`);
}

export async function requestHumanReview(token: string) {
  const application = await applicationForToken(token);
  if (!application) return;
  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: application.id },
      data: { humanReviewRequestedAt: new Date() },
    });
    await writeAuditLog(tx, {
      actorUserId: null,
      actorRole: "CANDIDATE_TOKEN",
      companyId: application.companyId,
      action: "HUMAN_REVIEW_REQUESTED",
      targetType: "APPLICATION",
      targetId: application.id,
      reason: STATUS_PAGE_REASON,
    });
  });
  revalidatePath(`/status/${token}`);
}

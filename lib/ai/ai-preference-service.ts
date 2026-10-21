import type { AiPreference } from "@prisma/client";

import { stopQueuedAiEvaluation } from "@/lib/ai/opt-out";
import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";

/**
 * A recruiter records what a candidate told them outside the product (an email reply, a call).
 * ALLOWED needs a written evidence note so the record can be checked later; it is audited.
 * It never clears a human-review request. Anything other than ALLOWED stops queued AI work.
 */
export async function recordAiPreference(input: {
  applicationId: number;
  companyId: number;
  actorUserId: number;
  preference: AiPreference;
  evidence: string;
}) {
  const evidence = input.evidence.trim();
  if (input.preference === "ALLOWED" && evidence.length < 10) {
    throw new Error("Describe how the candidate gave permission (for example, the email date) before recording it.");
  }
  const application = await prisma.application.findFirst({
    where: { id: input.applicationId, companyId: input.companyId },
    select: { id: true, aiPreference: true },
  });
  if (!application) throw new Error("Application not found.");
  await prisma.application.update({
    where: { id: application.id },
    data: {
      aiPreference: input.preference,
      aiPreferenceSource: "RECRUITER_ATTESTED",
      aiPreferenceAt: new Date(),
      aiOptOutAt: input.preference === "REFUSED" ? new Date() : null,
    },
  });
  if (input.preference !== "ALLOWED") await stopQueuedAiEvaluation(application.id);
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: input.companyId,
    action: "AI_PREFERENCE_RECORDED",
    targetType: "APPLICATION",
    targetId: application.id,
    reason: `${application.aiPreference} -> ${input.preference}: ${evidence.slice(0, 300)}`,
  });
}

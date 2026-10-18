import { hashSecureToken } from "@/lib/auth/secure-token";
import { prisma } from "@/lib/prisma";
import { validatePublicApplyToken } from "@/lib/validation/hosted-apply-validation";

export async function listKnockoutsForApplyToken(token: string) {
  const parsed = validatePublicApplyToken(token);
  if (!parsed) return [];
  const row = await prisma.applyToken.findUnique({
    where: { tokenHash: hashSecureToken(parsed) },
    select: { distribution: { select: { jobId: true, companyId: true } } },
  });
  if (!row) return [];
  return prisma.knockoutQuestion.findMany({
    where: { jobId: row.distribution.jobId, companyId: row.distribution.companyId },
    orderBy: { displayOrder: "asc" },
    select: { id: true, prompt: true },
  });
}

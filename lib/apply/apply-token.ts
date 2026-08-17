import { Prisma } from "@prisma/client";

import { generateSecureToken } from "@/lib/auth/secure-token";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { prisma } from "@/lib/prisma";
import { HOSTED_APPLY_APP_URL_REQUIRED } from "@/lib/apply/hosted-apply-errors";
import { JobDistributionError } from "@/lib/validation/job-distribution-validation";

type Db = Prisma.TransactionClient | typeof prisma;

export function requirePublicAppOrigin() {
  const origin = getPublicAppUrl();
  if (!origin) {
    throw new JobDistributionError(HOSTED_APPLY_APP_URL_REQUIRED);
  }

  return origin;
}

export function buildHostedApplyUrl(rawToken: string) {
  return `${requirePublicAppOrigin()}/apply/${rawToken}`;
}

export async function findLiveApplyToken(distributionId: number, db: Db = prisma) {
  return db.applyToken.findFirst({
    where: { distributionId, revokedAt: null },
    select: { id: true, tokenHash: true },
  });
}

export async function revokeLiveApplyTokens(
  distributionId: number,
  db: Db = prisma,
) {
  await db.applyToken.updateMany({
    where: { distributionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function mintHostedApplyTokenMaterial() {
  const generated = generateSecureToken();
  return {
    tokenHash: generated.tokenHash,
    applyUrl: buildHostedApplyUrl(generated.rawToken),
  };
}

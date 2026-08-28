import { Prisma } from "@prisma/client";

import { generateSecureToken } from "@/lib/auth/secure-token";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { prisma } from "@/lib/prisma";
import { HOSTED_APPLY_APP_URL_REQUIRED } from "@/lib/apply/hosted-apply-errors";
import {
  hostedApplyPathFromSnapshot,
  publicAbsoluteApplyUrl,
} from "@/lib/apply/hosted-apply-url";
import { JobDistributionError } from "@/lib/validation/job-distribution-validation";

export {
  hostedApplyPathFromSnapshot,
  hostedApplyTokenFromSnapshot,
  publicAbsoluteApplyUrl,
} from "@/lib/apply/hosted-apply-url";

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

/** Point stored snapshots at the current APP_URL. Tokens stay the same. */
export async function rewriteHostedApplySnapshotsToPublicOrigin(
  db: Db = prisma,
) {
  const origin = getPublicAppUrl();
  if (!origin) {
    return 0;
  }

  const rows = await db.jobDistribution.findMany({
    where: { applyUrlSnapshot: { not: null } },
    select: { id: true, applyUrlSnapshot: true },
  });

  let updated = 0;
  for (const row of rows) {
    const snapshot = row.applyUrlSnapshot;
    if (!snapshot || !hostedApplyPathFromSnapshot(snapshot)) {
      continue;
    }
    const next = publicAbsoluteApplyUrl(snapshot, origin);
    if (next === snapshot) {
      continue;
    }
    await db.jobDistribution.update({
      where: { id: row.id },
      data: { applyUrlSnapshot: next },
    });
    updated += 1;
  }

  return updated;
}

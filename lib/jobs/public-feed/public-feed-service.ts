import { Prisma, JobDistributionStatus, ApplyMode } from "@prisma/client";

import { publicAbsoluteApplyUrl } from "@/lib/apply/hosted-apply-url";
import { prisma } from "@/lib/prisma";

import { toCanonicalJobPosting, type CanonicalJobPosting } from "./canonical-job";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Public feed service (T96 Phase 1).
 *
 * Exposure contract (constitution §40):
 * - Only distributions in PUBLISHED status with applyMode HIREIQ_HOSTED
 *   and a stored apply URL snapshot are publicly listable.
 * - Jobs whose pinned specification is no longer published are excluded.
 * - No candidate data, recruiter data, or internal identifiers beyond the
 *   distribution reference ever leaves via this module.
 */

const distributionInclude = {
  pinnedSpecificationVersion: {
    select: {
      title: true,
      location: true,
      jobDescription: true,
      mustHaveRequirements: true,
      publishedAt: true,
      targetHireDate: true,
      structuredPayload: true,
    },
  },
  job: {
    select: {
      company: { select: { name: true, publicSlug: true } },
    },
  },
} satisfies Prisma.JobDistributionInclude;

export function publicHostedDistributionWhere(
  companyId?: number,
): Prisma.JobDistributionWhereInput {
  return {
    ...(companyId != null ? { companyId } : {}),
    status: JobDistributionStatus.PUBLISHED,
    applyMode: ApplyMode.HIREIQ_HOSTED,
    applyUrlSnapshot: { not: null },
    job: { status: "OPEN" },
    pinnedSpecificationVersion: { status: "PUBLISHED" },
  };
}

export async function listPublicFeedJobs(
  companyId: number,
  db: Db = prisma,
): Promise<CanonicalJobPosting[]> {
  const rows = await db.jobDistribution.findMany({
    where: publicHostedDistributionWhere(companyId),
    select: {
      id: true,
      createdAt: true,
      applyUrlSnapshot: true,
      ...distributionInclude,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const postings: CanonicalJobPosting[] = [];
  for (const row of rows) {
    const posting = toCanonicalJobPosting(row);
    if (posting) {
      postings.push({
        ...posting,
        applyUrl: publicAbsoluteApplyUrl(posting.applyUrl),
      });
    }
  }
  return postings;
}

export async function getPublicJobByDistributionId(
  distributionId: number,
  db: Db = prisma,
): Promise<CanonicalJobPosting | null> {
  if (!Number.isInteger(distributionId) || distributionId <= 0) return null;

  const row = await db.jobDistribution.findFirst({
    where: {
      id: distributionId,
      ...publicHostedDistributionWhere(),
    },
    select: {
      id: true,
      createdAt: true,
      applyUrlSnapshot: true,
      ...distributionInclude,
    },
  });

  const posting = row ? toCanonicalJobPosting(row) : null;
  if (!posting) return null;
  return {
    ...posting,
    applyUrl: publicAbsoluteApplyUrl(posting.applyUrl),
  };
}

/** True when the company has at least one publicly feedable job. */
export async function companyHasPublicFeed(
  companyId: number,
  db: Db = prisma,
): Promise<boolean> {
  const count = await db.jobDistribution.count({
    where: publicHostedDistributionWhere(companyId),
  });
  return count > 0;
}

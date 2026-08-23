import { JobDistributionStatus, ApplyMode } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/authorization";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { generateFeedToken } from "@/lib/jobs/public-feed/feed-token";

/**
 * Admin feed management (T96 Phase 5).
 *
 * Reveals the deterministic per-company feed token and the public URLs a
 * company needs to syndicate its roles. ADMIN-only: feed tokens grant
 * read access to a company's published job list, so they are never
 * exposed to CLIENT or INTERVIEWER roles.
 *
 * Note: tokens are stateless HMAC values (see feed-token.ts) — this module
 * derives, it does not store or create rows.
 */

export type CompanyFeedSummary = {
  companyId: number;
  companyName: string;
  publicJobCount: number;
};

export async function listCompanyFeedSummaries(): Promise<CompanyFeedSummary[]> {
  await requireAdmin();

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          jobDistributions: {
            where: {
              status: JobDistributionStatus.PUBLISHED,
              applyMode: ApplyMode.HIREIQ_HOSTED,
              applyUrlSnapshot: { not: null },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return companies.map((c) => ({
    companyId: c.id,
    companyName: c.name,
    publicJobCount: c._count.jobDistributions,
  }));
}

export type CompanyFeedDetail = {
  companyId: number;
  companyName: string;
  appUrlConfigured: boolean;
  feedUrl: string | null;
  jobs: Array<{
    distributionId: number;
    title: string;
    location: string | null;
    publicJobUrl: string | null;
    applyUrl: string | null;
  }>;
};

export async function getCompanyFeedDetail(input: {
  companyId: unknown;
}): Promise<CompanyFeedDetail> {
  await requireAdmin();

  const companyId = validateCompanyId(input.companyId);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) {
    throw new FeedManagementError("COMPANY_NOT_FOUND");
  }

  const distributions = await prisma.jobDistribution.findMany({
    where: {
      companyId,
      status: JobDistributionStatus.PUBLISHED,
      applyMode: ApplyMode.HIREIQ_HOSTED,
      job: { status: "OPEN" },
      pinnedSpecificationVersion: { status: "PUBLISHED" },
    },
    select: {
      id: true,
      applyUrlSnapshot: true,
      pinnedSpecificationVersion: {
        select: { title: true, location: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const origin = getPublicAppUrl();
  let feedUrl: string | null = null;
  if (origin) {
    const token = generateFeedToken(companyId);
    feedUrl = `${origin}/feeds/jobs.xml?company=${companyId}&token=${encodeURIComponent(token)}`;
  }

  return {
    companyId: company.id,
    companyName: company.name,
    appUrlConfigured: origin !== null,
    feedUrl,
    jobs: distributions.map((d) => ({
      distributionId: d.id,
      title: d.pinnedSpecificationVersion.title,
      location: d.pinnedSpecificationVersion.location,
      publicJobUrl: origin ? `${origin}/jobs/${d.id}` : null,
      applyUrl: d.applyUrlSnapshot,
    })),
  };
}

export class FeedManagementError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function validateCompanyId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (parsed > 0) return parsed;
  }
  throw new FeedManagementError("INVALID_COMPANY_ID");
}

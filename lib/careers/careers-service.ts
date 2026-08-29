import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { isValidPublicSlug } from "@/lib/companies/public-slug";
import {
  filterAndSortCareersRoles,
  uniqueCareersEmploymentTypes,
  uniqueCareersLocations,
  type CareersQuery,
  type PublicCareersRole,
} from "@/lib/careers/careers-filters";
import { parseJobPostingNarrative, employmentTypeLabels } from "@/lib/jobs/job-posting-view";
import {
  listPublicFeedJobs,
  publicHostedDistributionWhere,
} from "@/lib/jobs/public-feed/public-feed-service";

export type PublicCareersHub = {
  slug: string;
  companyName: string;
  industry: string;
  employees: number;
  aboutCompany: string | null;
  publishApplicationCount: boolean;
  roles: PublicCareersRole[];
  locations: string[];
  employmentTypes: Array<{ value: string; label: string }>;
};

async function authoredAboutCompany(companyId: number): Promise<string | null> {
  const rows = await prisma.jobDistribution.findMany({
    where: publicHostedDistributionWhere(companyId),
    select: {
      pinnedSpecificationVersion: {
        select: { structuredPayload: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const abouts: string[] = [];
  for (const row of rows) {
    const about = parseJobPostingNarrative(
      row.pinnedSpecificationVersion?.structuredPayload,
    )?.aboutCompany?.trim();
    if (about) {
      abouts.push(about);
    }
  }

  return (
    abouts.find((about) => !/\bthis role\b/i.test(about)) ?? abouts[0] ?? null
  );
}

async function loadPublicCareersHub(
  companySlug: string,
  query: CareersQuery = {},
): Promise<PublicCareersHub | null> {
  if (!isValidPublicSlug(companySlug)) {
    return null;
  }

  const company = await prisma.company.findUnique({
    where: { publicSlug: companySlug },
    select: {
      id: true,
      publicSlug: true,
      name: true,
      industry: true,
      employees: true,
      publishApplicationCount: true,
    },
  });

  if (!company) {
    return null;
  }

  const [canonicalRoles, aboutCompany, distributionRows] = await Promise.all([
    listPublicFeedJobs(company.id),
    authoredAboutCompany(company.id),
    prisma.jobDistribution.findMany({
      where: publicHostedDistributionWhere(company.id),
      select: { id: true, jobId: true },
    }),
  ]);

  const countByJobId = new Map<number, number>();
  if (company.publishApplicationCount) {
    const jobIds = [...new Set(distributionRows.map((row) => row.jobId))];
    if (jobIds.length > 0) {
      const grouped = await prisma.application.groupBy({
        by: ["jobId"],
        where: { companyId: company.id, jobId: { in: jobIds } },
        _count: { _all: true },
      });
      for (const row of grouped) {
        countByJobId.set(row.jobId, row._count._all);
      }
    }
  }

  const jobIdByDistribution = new Map(
    distributionRows.map((row) => [row.id, row.jobId]),
  );

  const allRoles: PublicCareersRole[] = canonicalRoles.map((role) => {
    const jobId = jobIdByDistribution.get(role.distributionId);
    const applicationCount =
      company.publishApplicationCount && jobId
        ? (countByJobId.get(jobId) ?? 0)
        : null;
    return {
      ...role,
      employmentTypeLabel: role.employmentType
        ? employmentTypeLabels[role.employmentType]
        : null,
      applicationCount,
    };
  });

  return {
    slug: company.publicSlug,
    companyName: company.name,
    industry: company.industry,
    employees: company.employees,
    aboutCompany,
    publishApplicationCount: company.publishApplicationCount,
    roles: filterAndSortCareersRoles(allRoles, query),
    locations: uniqueCareersLocations(allRoles),
    employmentTypes: uniqueCareersEmploymentTypes(allRoles),
  };
}

/**
 * Request-deduped hub loader — metadata + page share one DB trip.
 */
export const getPublicCareersHub = cache(loadPublicCareersHub);

export type PublicCareersDirectoryEntry = {
  slug: string;
  companyName: string;
  industry: string;
  openRoles: number;
};

/**
 * Public index of companies that currently have at least one HireIQ-hosted
 * open role. Lightweight count only — no posting payloads.
 */
async function loadPublicCareersDirectory(): Promise<
  PublicCareersDirectoryEntry[]
> {
  const rows = await prisma.jobDistribution.findMany({
    where: publicHostedDistributionWhere(),
    select: {
      job: {
        select: {
          company: {
            select: { name: true, publicSlug: true, industry: true },
          },
        },
      },
    },
    take: 500,
  });

  const bySlug = new Map<string, PublicCareersDirectoryEntry>();
  for (const row of rows) {
    const company = row.job.company;
    const existing = bySlug.get(company.publicSlug);
    if (existing) {
      existing.openRoles += 1;
    } else {
      bySlug.set(company.publicSlug, {
        slug: company.publicSlug,
        companyName: company.name,
        industry: company.industry,
        openRoles: 1,
      });
    }
  }

  return [...bySlug.values()].sort((a, b) =>
    a.companyName.localeCompare(b.companyName),
  );
}

export const listPublicCareersDirectory = cache(loadPublicCareersDirectory);

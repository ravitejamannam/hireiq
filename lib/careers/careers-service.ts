import { prisma } from "@/lib/prisma";
import { isValidPublicSlug } from "@/lib/companies/public-slug";
import { parseJobPostingNarrative } from "@/lib/jobs/job-posting-view";
import {
  listPublicFeedJobs,
  publicHostedDistributionWhere,
} from "@/lib/jobs/public-feed/public-feed-service";
import type { CanonicalJobPosting } from "@/lib/jobs/public-feed/canonical-job";

export type PublicCareersHub = {
  slug: string;
  companyName: string;
  industry: string;
  employees: number;
  aboutCompany: string | null;
  roles: CanonicalJobPosting[];
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
    take: 20,
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

export async function getPublicCareersHub(
  companySlug: string,
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
    },
  });

  if (!company) {
    return null;
  }

  const [roles, aboutCompany] = await Promise.all([
    listPublicFeedJobs(company.id),
    authoredAboutCompany(company.id),
  ]);

  return {
    slug: company.publicSlug,
    companyName: company.name,
    industry: company.industry,
    employees: company.employees,
    aboutCompany,
    roles,
  };
}

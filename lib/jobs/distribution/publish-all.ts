import { DistributionProvider } from "@prisma/client";

import { publishJobDistributionForCompany } from "@/lib/jobs/distribution/distribution-service";
import { prisma } from "@/lib/prisma";

const BOARDS = [DistributionProvider.LINKEDIN, DistributionProvider.NAUKRI, DistributionProvider.INDEED] as const;

export async function publishJobToBoards(input: { companyId: number; jobId: number }) {
  const job = await prisma.job.findFirst({
    where: { id: input.jobId, companyId: input.companyId },
    select: { id: true, currentPublishedSpecificationVersionId: true },
  });
  if (!job?.currentPublishedSpecificationVersionId) {
    throw new Error("Publish the job description before posting it to job boards.");
  }
  const results = [];
  for (const provider of BOARDS) {
    const existing = await prisma.jobDistribution.findFirst({
      where: { companyId: input.companyId, jobId: job.id, provider },
      select: { id: true, status: true },
    });
    if (!existing) {
      results.push({ provider, status: "missing-connection", distributionId: null });
      continue;
    }
    if (existing.status === "PUBLISHED") {
      results.push({ provider, status: "already-published", distributionId: existing.id });
      continue;
    }
    try {
      const published = await publishJobDistributionForCompany({ companyId: input.companyId, distributionId: existing.id });
      results.push({ provider, status: published.status, distributionId: existing.id });
    } catch (error) {
      results.push({
        provider,
        status: "failed",
        distributionId: existing.id,
        error: error instanceof Error ? error.message : "The board rejected the post.",
      });
    }
  }
  return results;
}

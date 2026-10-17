import "@/lib/evidence-graph/evidence-graph-test-env";

import { afterAll, describe, expect, it } from "vitest";
import { JobSpecificationVersionStatus, JobStatus } from "@prisma/client";

import { acceptGeneratedJobDescriptionForActor } from "@/lib/jobs/job-description-ai";
import { JobValidationError } from "@/lib/validation/job-validation";
import { prisma } from "@/lib/prisma";

const MARKER = `jd-${process.pid}-${Date.now()}`;

describe("job description acceptance", () => {
  const companyIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.job.updateMany({
      where: { companyId: { in: companyIds } },
      data: { currentPublishedSpecificationVersionId: null },
    });
    await prisma.jobSpecificationVersion.deleteMany({
      where: { job: { companyId: { in: companyIds } } },
    });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  it("copies an accepted draft onto the draft row and leaves the published version unchanged", async () => {
    const company = await prisma.company.create({
      data: {
        name: `${MARKER} co`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    companyIds.push(company.id);
    const job = await prisma.job.create({
      data: {
        title: `${MARKER} role`,
        status: JobStatus.OPEN,
        companyId: company.id,
        jobDescription: "Published working copy",
      },
    });
    const published = await prisma.jobSpecificationVersion.create({
      data: {
        jobId: job.id,
        versionNumber: 1,
        status: JobSpecificationVersionStatus.PUBLISHED,
        publishedAt: new Date(),
        title: `${MARKER} role`,
        jobDescription: "Immutable published text",
      },
    });
    await prisma.job.update({
      where: { id: job.id },
      data: { currentPublishedSpecificationVersionId: published.id },
    });
    const draft = await prisma.jobSpecificationVersion.create({
      data: {
        jobId: job.id,
        versionNumber: 2,
        status: JobSpecificationVersionStatus.DRAFT,
        title: `${MARKER} role`,
        jobDescription: "Old draft",
        aiGenerationStatus: "READY",
        aiProposedJobDescription: "Approved draft text",
        aiGeneratedAt: new Date(),
      },
    });

    await expect(
      acceptGeneratedJobDescriptionForActor({
        jobId: job.id,
        actor: { userId: 1, companyId: company.id + 1, isAdmin: false },
      }),
    ).rejects.toBeInstanceOf(JobValidationError);

    const accepted = await acceptGeneratedJobDescriptionForActor({
      jobId: job.id,
      actor: { userId: 1, companyId: company.id, isAdmin: false },
    });
    expect(accepted.jobDescription).toBe("Approved draft text");
    expect(accepted.aiProposedJobDescription).toBeNull();
    expect(
      (await prisma.jobSpecificationVersion.findUnique({
        where: { id: published.id },
        select: { jobDescription: true, status: true },
      })),
    ).toEqual({
      jobDescription: "Immutable published text",
      status: JobSpecificationVersionStatus.PUBLISHED,
    });
    expect(draft.id).toBe(accepted.id);
  });
});

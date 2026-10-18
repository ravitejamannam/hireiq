import "@/lib/evidence-graph/evidence-graph-test-env";

import { afterAll, describe, expect, it } from "vitest";
import { JobSpecificationVersionStatus, JobStatus } from "@prisma/client";

import { setJobDescriptionGeneratorForTests } from "@/lib/ai/job-description-generator";
import { JobDescriptionAiError } from "@/lib/ai/job-description-output";
import {
  acceptGeneratedJobDescriptionForActor,
  generateJobDescriptionForActor,
} from "@/lib/jobs/job-description-ai";
import { JobValidationError } from "@/lib/validation/job-validation";
import { prisma } from "@/lib/prisma";

const MARKER = `gen-${process.pid}-${Date.now()}`;
const ACTOR_USER_ID = 1_000_000_000 + (process.pid % 100_000) * 1_000 + (Date.now() % 1_000);

describe("job description generation", () => {
  const companyIds: number[] = [];

  afterAll(async () => {
    setJobDescriptionGeneratorForTests(null);
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

  it("rejects invalid output and keeps the published specification unchanged", async () => {
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
        jobDescription: "Working copy",
        mustHaveRequirements: "TypeScript",
        niceToHaveRequirements: "GraphQL",
      },
    });
    const published = await prisma.jobSpecificationVersion.create({
      data: {
        jobId: job.id,
        versionNumber: 1,
        status: JobSpecificationVersionStatus.PUBLISHED,
        publishedAt: new Date(),
        title: `${MARKER} role`,
        jobDescription: "Published text",
        mustHaveRequirements: "TypeScript",
        niceToHaveRequirements: "GraphQL",
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
        mustHaveRequirements: "TypeScript",
        niceToHaveRequirements: "GraphQL",
      },
    });
    const actor = { userId: ACTOR_USER_ID, companyId: company.id, isAdmin: false };

    setJobDescriptionGeneratorForTests(async () => ({ jobDescription: "   " }));
    await expect(generateJobDescriptionForActor({ jobId: job.id, actor })).rejects.toBeInstanceOf(
      JobDescriptionAiError,
    );
    expect(
      (await prisma.jobSpecificationVersion.findUnique({
        where: { id: draft.id },
        select: { aiGenerationStatus: true, aiProposedJobDescription: true, mustHaveRequirements: true },
      })),
    ).toEqual({
      aiGenerationStatus: "FAILED",
      aiProposedJobDescription: null,
      mustHaveRequirements: "TypeScript",
    });
    expect(
      (await prisma.job.findUnique({ where: { id: job.id }, select: { jobDescription: true } }))
        ?.jobDescription,
    ).toBe("Working copy");
    expect(
      (await prisma.jobSpecificationVersion.findUnique({
        where: { id: published.id },
        select: { jobDescription: true },
      }))?.jobDescription,
    ).toBe("Published text");

    await prisma.jobSpecificationVersion.update({
      where: { id: draft.id },
      data: { aiGenerationStatus: "NONE" },
    });
    setJobDescriptionGeneratorForTests(async () => ({
      jobDescription: "Generated body. Required: TypeScript. Preferred: GraphQL.",
    }));
    const generated = await generateJobDescriptionForActor({ jobId: job.id, actor });
    expect(generated.aiGenerationStatus).toBe("READY");
    expect(generated.mustHaveRequirements).toBe("TypeScript");
    expect(generated.niceToHaveRequirements).toBe("GraphQL");
    expect(generated.aiProposedJobDescription).toContain("TypeScript");

    await expect(
      acceptGeneratedJobDescriptionForActor({
        jobId: job.id,
        actor: { userId: ACTOR_USER_ID, companyId: company.id + 99, isAdmin: false },
      }),
    ).rejects.toBeInstanceOf(JobValidationError);

    const accepted = await acceptGeneratedJobDescriptionForActor({ jobId: job.id, actor });
    expect(accepted.jobDescription).toContain("Preferred: GraphQL");
    expect(accepted.mustHaveRequirements).toBe("TypeScript");
    expect(
      (await prisma.jobSpecificationVersion.findUnique({
        where: { id: published.id },
        select: { jobDescription: true, mustHaveRequirements: true, niceToHaveRequirements: true },
      })),
    ).toEqual({
      jobDescription: "Published text",
      mustHaveRequirements: "TypeScript",
      niceToHaveRequirements: "GraphQL",
    });
  });

  it("creates a draft from the published specification before generating", async () => {
    const company = await prisma.company.create({
      data: {
        name: `${MARKER} published`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}-pub`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    companyIds.push(company.id);
    const job = await prisma.job.create({
      data: {
        title: `${MARKER} published role`,
        status: JobStatus.OPEN,
        companyId: company.id,
        jobDescription: "Published body",
        mustHaveRequirements: "Go",
      },
    });
    await prisma.jobSpecificationVersion.create({
      data: {
        jobId: job.id,
        versionNumber: 1,
        status: JobSpecificationVersionStatus.PUBLISHED,
        publishedAt: new Date(),
        title: `${MARKER} published role`,
        jobDescription: "Published body",
        mustHaveRequirements: "Go",
      },
    });
    setJobDescriptionGeneratorForTests(async () => ({
      jobDescription: "Drafted from the published specification.",
    }));
    const generated = await generateJobDescriptionForActor({
      jobId: job.id,
      actor: { userId: ACTOR_USER_ID, companyId: company.id, isAdmin: false },
    });
    expect(generated.status).toBe("DRAFT");
    expect(generated.versionNumber).toBe(2);
    expect(generated.mustHaveRequirements).toBe("Go");
    expect(generated.aiGenerationStatus).toBe("READY");
  });
});

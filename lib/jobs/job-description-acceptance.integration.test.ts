import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, describe, expect, it } from "vitest";
import { JobSpecificationVersionStatus, JobStatus } from "@prisma/client";
import { acceptGeneratedJobDescriptionForActor } from "@/lib/jobs/job-description-ai";
import { JobValidationError } from "@/lib/validation/job-validation";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `jd-${process.pid}-${Date.now()}`;

describe.skipIf(integrationDatabase.mode === "skip")("job description acceptance", () => {
  const companyIds: number[] = [];
  const jobIds: number[] = [];
  const versionIds: number[] = [];

  afterAll(async () => {
    const companies = companyIds.filter((id) => id > 0);
    const jobs = jobIds.filter((id) => id > 0);
    const versions = versionIds.filter((id) => id > 0);
    if (companies.length + jobs.length + versions.length === 0) return;

    const failures: string[] = [];
    const attempt = async (step: string, run: () => Promise<unknown>) => {
      try {
        await run();
        return true;
      } catch (error) {
        failures.push(`${step}: ${error instanceof Error ? error.message : "cleanup failed"}`);
        return false;
      }
    };

    // Job.currentPublishedSpecificationVersion is SetNull, so clearing the
    // pointer is not required before deleting the version. The version's job
    // relation is Restrict, and Job.company is Restrict.
    if (jobs.length > 0) {
      await attempt("published specification pointers", () =>
        prisma.job.updateMany({
          where: { id: { in: jobs } },
          data: { currentPublishedSpecificationVersionId: null },
        }));
    }
    let versionsGone = versions.length === 0;
    if (versions.length > 0) {
      versionsGone = await attempt("specification versions", () =>
        prisma.jobSpecificationVersion.deleteMany({ where: { id: { in: versions } } }));
    }
    let jobsGone = jobs.length === 0;
    if (versionsGone && jobs.length > 0) {
      jobsGone = await attempt("jobs", () =>
        prisma.job.deleteMany({ where: { id: { in: jobs } } }));
    }
    if (jobsGone && companies.length > 0) {
      await attempt("companies", () =>
        prisma.company.deleteMany({ where: { id: { in: companies } } }));
    }
    if (failures.length > 0) {
      throw new Error(`Job description acceptance fixture cleanup failed.\n${failures.join("\n")}`);
    }
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
    jobIds.push(job.id);
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
    versionIds.push(published.id);
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
    versionIds.push(draft.id);

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

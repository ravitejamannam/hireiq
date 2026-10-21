import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { CandidateStatus, JobSpecificationVersionStatus, JobStatus } from "@prisma/client";
import { GET } from "@/app/api/v1/applications/route";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `api-app-${process.pid}-${Date.now()}`;

function apiKey(companyId: number, suffix: string) {
  return `hireiq_${companyId}_${suffix}`;
}

function hashKey(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

describe.skipIf(integrationDatabase.mode === "skip")("public applications API company scope", () => {
  const companyIds: number[] = [];
  const jobIds: number[] = [];
  const versionIds: number[] = [];
  const candidateIds: number[] = [];
  const applicationIds: number[] = [];
  const ingestionIds: number[] = [];
  const tokenIds: number[] = [];
  const candidateCompanyIds = new Map<number, number>();
  const jobCompanyIds = new Map<number, number>();
  const ingestionCompanyIds = new Map<number, number>();
  const tokenCompanyIds = new Map<number, number>();

  afterAll(async () => {
    if (integrationDatabase.mode !== "accept") return;
    const companies = companyIds.filter((id) => id > 0);
    const jobs = jobIds.filter((id) => id > 0);
    const versions = versionIds.filter((id) => id > 0);
    const candidates = candidateIds.filter((id) => id > 0);
    const applications = applicationIds.filter((id) => id > 0);
    const ingestions = ingestionIds.filter((id) => id > 0);
    const tokens = tokenIds.filter((id) => id > 0);
    if (
      companies.length +
        jobs.length +
        versions.length +
        candidates.length +
        applications.length +
        ingestions.length +
        tokens.length ===
      0
    ) {
      return;
    }

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

    // AuthRateLimit has no company relation. ApplicationIngestionEvent restricts
    // Application, Candidate, Job, JobSpecificationVersion, and Company.
    // ApiToken restricts Company only. The published-spec pointer is SetNull.
    // JobSpecificationVersion.job is Restrict. Application restricts Candidate
    // and Job. Candidate and Job restrict Company. A failed child blocks only
    // the company that still owns it.
    if (companies.length > 0) {
      await attempt("api rate limits", () =>
        prisma.authRateLimit.deleteMany({
          where: { OR: companies.map((companyId) => ({ key: `apiKeyToken:apiKey:${companyId}` })) },
        }));
    }
    let ingestionsGone = ingestions.length === 0;
    if (ingestions.length > 0) {
      ingestionsGone = await attempt("ingestion events", () =>
        prisma.applicationIngestionEvent.deleteMany({ where: { id: { in: ingestions } } }));
    }
    let tokensGone = tokens.length === 0;
    if (tokens.length > 0) {
      tokensGone = await attempt("api tokens", () =>
        prisma.apiToken.deleteMany({ where: { id: { in: tokens } } }));
    }
    if (jobs.length > 0) {
      await attempt("published specification pointers", () =>
        prisma.job.updateMany({
          where: { id: { in: jobs } },
          data: { currentPublishedSpecificationVersionId: null },
        }));
    }
    let versionsGone = versions.length === 0;
    if (ingestionsGone && versions.length > 0) {
      versionsGone = await attempt("specification versions", () =>
        prisma.jobSpecificationVersion.deleteMany({ where: { id: { in: versions } } }));
    }
    let applicationsGone = applications.length === 0;
    if (ingestionsGone && applications.length > 0) {
      applicationsGone = await attempt("applications", () =>
        prisma.application.deleteMany({ where: { id: { in: applications } } }));
    }
    let candidatesGone = candidates.length === 0;
    if (ingestionsGone && applicationsGone && candidates.length > 0) {
      candidatesGone = await attempt("candidates", () =>
        prisma.candidate.deleteMany({ where: { id: { in: candidates } } }));
    }
    let jobsGone = jobs.length === 0;
    if (ingestionsGone && applicationsGone && versionsGone && jobs.length > 0) {
      jobsGone = await attempt("jobs", () =>
        prisma.job.deleteMany({ where: { id: { in: jobs } } }));
    }

    const blockedCompanies = new Set<number>();
    const block = (ids: number[], owners: Map<number, number>) => {
      for (const id of ids) {
        const companyId = owners.get(id);
        if (companyId && companyId > 0) blockedCompanies.add(companyId);
      }
    };
    if (!ingestionsGone) block(ingestions, ingestionCompanyIds);
    if (!tokensGone) block(tokens, tokenCompanyIds);
    if (!candidatesGone) block(candidates, candidateCompanyIds);
    if (!jobsGone) block(jobs, jobCompanyIds);
    const deletableCompanies = companies.filter((id) => !blockedCompanies.has(id));
    if (deletableCompanies.length > 0) {
      await attempt("companies", () =>
        prisma.company.deleteMany({ where: { id: { in: deletableCompanies } } }));
    }
    if (failures.length > 0) {
      throw new Error(`Public application fixture cleanup failed.\n${failures.join("\n")}`);
    }
  });

  it("returns only the key's company and does not use Application.source as intake", async () => {
    const companyA = await prisma.company.create({
      data: { name: `${MARKER} A`, industry: "Software", employees: 2, publicSlug: `${MARKER}-a`.slice(0, 60) },
    });
    companyIds.push(companyA.id);
    const companyB = await prisma.company.create({
      data: { name: `${MARKER} B`, industry: "Software", employees: 2, publicSlug: `${MARKER}-b`.slice(0, 60) },
    });
    companyIds.push(companyB.id);

    async function application(companyId: number, label: string, source: "NAUKRI" | null) {
      const job = await prisma.job.create({
        data: { title: `${MARKER} ${label}`, companyId, status: JobStatus.OPEN },
      });
      jobIds.push(job.id);
      jobCompanyIds.set(job.id, companyId);
      const spec = await prisma.jobSpecificationVersion.create({
        data: {
          jobId: job.id,
          versionNumber: 1,
          status: JobSpecificationVersionStatus.PUBLISHED,
          title: job.title,
          publishedAt: new Date(),
        },
      });
      versionIds.push(spec.id);
      const candidate = await prisma.candidate.create({
        data: {
          name: `${MARKER} ${label}`,
          role: "Engineer",
          experienceYears: 1,
          status: CandidateStatus.APPLIED,
          companyId,
        },
      });
      candidateIds.push(candidate.id);
      candidateCompanyIds.set(candidate.id, companyId);
      const created = await prisma.application.create({
        data: { candidateId: candidate.id, jobId: job.id, companyId, source: source ?? undefined },
      });
      applicationIds.push(created.id);
      return { job, spec, created };
    }

    const owned = await application(companyA.id, "owned", "NAUKRI");
    const other = await application(companyB.id, "other", null);
    const receivedAt = new Date("2026-03-15T12:00:00.000Z");
    const ownedEvent = await prisma.applicationIngestionEvent.create({
      data: {
        companyId: companyA.id,
        jobId: owned.job.id,
        applicationId: owned.created.id,
        candidateId: owned.created.candidateId,
        sourceChannel: "MANUAL",
        externalApplicationId: "import:3:2",
        jobSpecificationVersionId: owned.spec.id,
        status: "PROCESSED",
        applicantName: `${MARKER} owned`,
        receivedAt,
      },
    });
    ingestionIds.push(ownedEvent.id);
    ingestionCompanyIds.set(ownedEvent.id, companyA.id);
    const otherEvent = await prisma.applicationIngestionEvent.create({
      data: {
        companyId: companyB.id,
        jobId: other.job.id,
        applicationId: other.created.id,
        candidateId: other.created.candidateId,
        sourceChannel: "HOSTED_APPLY",
        jobSpecificationVersionId: other.spec.id,
        status: "PROCESSED",
        applicantName: `${MARKER} other`,
        receivedAt,
      },
    });
    ingestionIds.push(otherEvent.id);
    ingestionCompanyIds.set(otherEvent.id, companyB.id);

    const keyA = apiKey(companyA.id, `${MARKER}-a`);
    const token = await prisma.apiToken.create({
      data: { companyId: companyA.id, name: "test", tokenHash: hashKey(keyA) },
    });
    tokenIds.push(token.id);
    tokenCompanyIds.set(token.id, companyA.id);

    const response = await GET(new Request("http://localhost/api/v1/applications", {
      headers: { authorization: `Bearer ${keyA}` },
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.count).toBe(1);
    expect(body.applications).toEqual([
      expect.objectContaining({
        id: owned.created.id,
        source: "MANUAL",
        intakeMethod: "CSV Import",
      }),
    ]);
    expect(JSON.stringify(body)).not.toContain("import:3:2");
    expect(JSON.stringify(body)).not.toContain("NAUKRI");
    expect(body.applications[0]?.id).not.toBe(other.created.id);
  });
});

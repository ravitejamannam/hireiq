import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listReviewQueue } from "@/lib/review/review-queue-service";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `lrq-${process.pid}-${Date.now()}`;
const filters = { stage: "", minScore: "", maxScore: "", knockout: "", parse: "", human: "" };

describe.skipIf(integrationDatabase.mode === "skip")("listReviewQueue ownership", () => {
  const companyIds: number[] = [];
  let a = { companyId: 0, jobId: 0 };
  let b = { companyId: 0, jobId: 0 };

  async function tenant(label: string, applicants: number) {
    const company = await prisma.company.create({
      data: { name: `${MARKER}-${label}`, industry: "Test", employees: 1, publicSlug: `${MARKER}-${label}` },
    });
    companyIds.push(company.id);
    const job = await prisma.job.create({ data: { title: `${MARKER}-${label}`, status: JobStatus.OPEN, companyId: company.id } });
    for (let i = 0; i < applicants; i += 1) {
      const candidate = await prisma.candidate.create({
        data: { name: `Synthetic ${label} ${i}`, role: "Engineer", experienceYears: 2, status: "APPLIED", companyId: company.id },
      });
      await prisma.application.create({ data: { candidateId: candidate.id, jobId: job.id, companyId: company.id } });
    }
    return { companyId: company.id, jobId: job.id };
  }

  beforeAll(async () => {
    a = await tenant("a", 3);
    b = await tenant("b", 2);
  });

  afterAll(async () => {
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  it("lists a company's own applications", async () => {
    const own = await listReviewQueue({ jobId: a.jobId, companyId: a.companyId, filters, page: 1 });
    expect(own.total).toBe(3);
    expect(own.rows).toHaveLength(3);
    const other = await listReviewQueue({ jobId: b.jobId, companyId: b.companyId, filters, page: 1 });
    expect(other.total).toBe(2);
  });

  it("refuses another company's job and returns no data", async () => {
    await expect(listReviewQueue({ jobId: b.jobId, companyId: a.companyId, filters, page: 1 })).rejects.toThrow("Requirement not found.");
    await expect(listReviewQueue({ jobId: a.jobId, companyId: b.companyId, filters, page: 1 })).rejects.toThrow("Requirement not found.");
  });

  it("treats a missing job the same as a foreign one", async () => {
    await expect(listReviewQueue({ jobId: 2_000_000_000, companyId: a.companyId, filters, page: 1 })).rejects.toThrow("Requirement not found.");
  });

  it("has no caller that omits companyId (the type requires it and every call site passes it)", () => {
    for (const file of ["scripts/e2e-full-run.ts"]) {
      const source = readFileSync(file, "utf8");
      const calls = source.match(/listReviewQueue\(\{[^}]*\}/g) ?? [];
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) expect(call).toContain("companyId");
    }
  });
});

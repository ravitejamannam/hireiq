import "@/lib/evidence-graph/evidence-graph-test-env";
import { readFileSync } from "fs";
import { join } from "path";
import { afterAll, describe, expect, it } from "vitest";
import { CandidateStatus } from "@prisma/client";
import { updateCandidateRecord } from "@/lib/candidates/candidate-record";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `cand-${process.pid}-${Date.now()}`;
const companyIds: number[] = [];
const candidateIds: number[] = [];
const candidateCompanyIds = new Map<number, number>();

afterAll(async () => {
  const companies = companyIds.filter((id) => id > 0);
  const candidates = candidateIds.filter((id) => id > 0);
  if (companies.length + candidates.length === 0) return;

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

  // Candidate.company is Restrict. A candidate blocks only its own company.
  let candidatesGone = candidates.length === 0;
  if (candidates.length > 0) {
    candidatesGone = await attempt("candidates", () =>
      prisma.candidate.deleteMany({ where: { id: { in: candidates } } }));
  }
  const blockedCompanies = new Set<number>();
  if (!candidatesGone) {
    for (const candidateId of candidates) {
      const companyId = candidateCompanyIds.get(candidateId);
      if (companyId && companyId > 0) blockedCompanies.add(companyId);
    }
  }
  const deletableCompanies = companies.filter((id) => !blockedCompanies.has(id));
  if (deletableCompanies.length > 0) {
    await attempt("companies", () =>
      prisma.company.deleteMany({ where: { id: { in: deletableCompanies } } }));
  }
  if (failures.length > 0) {
    throw new Error(`Candidate record fixture cleanup failed.\n${failures.join("\n")}`);
  }
});

describe.skipIf(integrationDatabase.mode === "skip")("candidate company immutability", () => {
  it("updates editable fields and keeps the stored company", async () => {
    const companyA = await prisma.company.create({
      data: {
        name: `${MARKER} a`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}-a`.toLowerCase(),
      },
    });
    companyIds.push(companyA.id);
    const companyB = await prisma.company.create({
      data: {
        name: `${MARKER} b`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}-b`.toLowerCase(),
      },
    });
    companyIds.push(companyB.id);
    const candidate = await prisma.candidate.create({
      data: {
        name: "Before",
        role: "Engineer",
        experienceYears: 1,
        status: CandidateStatus.APPLIED,
        companyId: companyA.id,
      },
    });
    candidateIds.push(candidate.id);
    candidateCompanyIds.set(candidate.id, companyA.id);

    const updated = await updateCandidateRecord(
      candidate.id,
      "After",
      "Staff Engineer",
      4,
      CandidateStatus.INTERVIEWING,
    );

    expect(updated.companyId).toBe(companyA.id);
    expect(updated.companyId).not.toBe(companyB.id);
    expect(updated.name).toBe("After");
    expect(updated.role).toBe("Staff Engineer");
    expect(updated.experienceYears).toBe(4);
    expect(updated.status).toBe(CandidateStatus.INTERVIEWING);

    const stored = await prisma.candidate.findUniqueOrThrow({
      where: { id: candidate.id },
    });
    expect(stored.companyId).toBe(companyA.id);
  });

  it("does not accept a company id on the update action", () => {
    const source = readFileSync(
      join(process.cwd(), "app/actions/candidate-actions.ts"),
      "utf8",
    );
    const updateStart = source.indexOf("export async function updateCandidate");
    const deleteStart = source.indexOf("export async function deleteCandidate");
    const updateBody = source.slice(updateStart, deleteStart);
    expect(updateBody).toContain("await requireAdmin()");
    expect(updateBody).not.toContain("companyId");
    expect(source).toContain("export async function createCandidate");
    expect(source.slice(0, updateStart)).toContain("companyId");
  });
});

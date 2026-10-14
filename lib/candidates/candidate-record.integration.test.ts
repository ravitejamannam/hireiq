import "@/lib/evidence-graph/evidence-graph-test-env";

import { readFileSync } from "fs";
import { join } from "path";

import { afterAll, describe, expect, it } from "vitest";
import { CandidateStatus } from "@prisma/client";

import { updateCandidateRecord } from "@/lib/candidates/candidate-record";
import { prisma } from "@/lib/prisma";

const MARKER = `cand-${process.pid}-${Date.now()}`;
const companyIds: number[] = [];

afterAll(async () => {
  if (companyIds.length === 0) return;
  await prisma.candidate.deleteMany({
    where: { companyId: { in: companyIds } },
  });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
});

describe("candidate company immutability", () => {
  it("updates editable fields and keeps the stored company", async () => {
    const companyA = await prisma.company.create({
      data: {
        name: `${MARKER} a`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}-a`.toLowerCase(),
      },
    });
    const companyB = await prisma.company.create({
      data: {
        name: `${MARKER} b`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}-b`.toLowerCase(),
      },
    });
    companyIds.push(companyA.id, companyB.id);
    const candidate = await prisma.candidate.create({
      data: {
        name: "Before",
        role: "Engineer",
        experienceYears: 1,
        status: CandidateStatus.APPLIED,
        companyId: companyA.id,
      },
    });

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

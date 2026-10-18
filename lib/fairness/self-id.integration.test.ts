import { afterAll, describe, expect, it } from "vitest";

import { deleteSelfIdentification, saveSelfIdentification } from "@/lib/fairness/self-id";
import { prisma } from "@/lib/prisma";

describe("self-identification deletion", () => {
  const companyIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.candidateSelfIdentification.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
  });

  it("stores a voluntary answer and then erases it", async () => {
    const company = await prisma.company.create({
      data: { name: `selfid-${Date.now()}`, industry: "Test", employees: 1, publicSlug: `selfid-${Date.now()}` },
    });
    companyIds.push(company.id);
    const candidate = await prisma.candidate.create({
      data: { name: "Optional", role: "Engineer", experienceYears: 3, status: "APPLIED", companyId: company.id },
    });
    await saveSelfIdentification({ candidateId: candidate.id, companyId: company.id, gender: "woman", ageBand: "25_34" });
    expect(await prisma.candidateSelfIdentification.count({ where: { candidateId: candidate.id } })).toBe(1);
    await deleteSelfIdentification(candidate.id);
    expect(await prisma.candidateSelfIdentification.count({ where: { candidateId: candidate.id } })).toBe(0);
  });
});

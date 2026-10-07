import "@/lib/evidence-graph/evidence-graph-test-env";

import { afterAll, describe, expect, it } from "vitest";
import {
  CandidateEvidenceOrigin,
  CandidateEvidenceSourceType,
  CandidateStatus,
  JobSpecificationVersionStatus,
  JobStatus,
  PortalRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  createHumanRelevanceJudgment,
  loadHumanRelevanceCollection,
} from "@/lib/relevance/human-relevance-operations";

const MARKER = `m121-${process.pid}-${Date.now()}`;
const companyIds: number[] = [];

async function world(label: string) {
  const company = await prisma.company.create({
    data: {
      name: `${MARKER} ${label}`,
      industry: "Test",
      employees: 1,
      publicSlug: `${MARKER}-${label}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
    },
  });
  companyIds.push(company.id);
  const user = await prisma.user.create({
    data: {
      email: `${MARKER}-${label}@hireiq.test`,
      name: label,
      role: PortalRole.CLIENT,
      passwordHash: "test",
      emailVerifiedAt: new Date(),
      companyId: company.id,
    },
  });
  const job = await prisma.job.create({
    data: {
      title: `${label} role`,
      status: JobStatus.OPEN,
      companyId: company.id,
      primarySkills: "LIVE JOB SKILL MUST NOT APPEAR",
    },
  });
  const spec = await prisma.jobSpecificationVersion.create({
    data: {
      jobId: job.id,
      versionNumber: 1,
      status: JobSpecificationVersionStatus.PUBLISHED,
      publishedAt: new Date(),
      title: `${label} role`,
      primarySkills: "Published Python",
    },
  });
  await prisma.job.update({
    where: { id: job.id },
    data: { currentPublishedSpecificationVersionId: spec.id },
  });
  const candidate = await prisma.candidate.create({
    data: {
      name: `${label} Candidate`,
      role: "Engineer",
      experienceYears: 3,
      status: CandidateStatus.APPLIED,
      companyId: company.id,
      skills: "PROFILE SKILL MUST NOT APPEAR",
    },
  });
  const application = await prisma.application.create({
    data: {
      candidateId: candidate.id,
      jobId: job.id,
      companyId: company.id,
      status: "TECH_EVALUATION",
      expertScore: 99,
      rejectionReason: "secret",
    },
  });
  const evidence = await prisma.candidateEvidence.create({
    data: {
      companyId: company.id,
      candidateId: candidate.id,
      applicationId: application.id,
      sourceType: CandidateEvidenceSourceType.RECRUITER_ENTERED_TEXT,
      origin: CandidateEvidenceOrigin.RECRUITER_ENTERED,
      inlineText: "Used Python in production",
      contentSha256: `${MARKER}-live`,
    },
  });
  await prisma.candidateEvidence.create({
    data: {
      companyId: company.id,
      candidateId: candidate.id,
      applicationId: application.id,
      sourceType: CandidateEvidenceSourceType.RECRUITER_ENTERED_TEXT,
      origin: CandidateEvidenceOrigin.RECRUITER_ENTERED,
      inlineText: "REVOKED TEXT",
      contentSha256: `${MARKER}-revoked`,
      revokedAt: new Date(),
    },
  });
  const older = await prisma.candidateEvidence.create({
    data: {
      companyId: company.id,
      candidateId: candidate.id,
      applicationId: application.id,
      sourceType: CandidateEvidenceSourceType.RECRUITER_ENTERED_TEXT,
      origin: CandidateEvidenceOrigin.RECRUITER_ENTERED,
      inlineText: "SUPERSEDED TEXT",
      contentSha256: `${MARKER}-old`,
    },
  });
  const newer = await prisma.candidateEvidence.create({
    data: {
      companyId: company.id,
      candidateId: candidate.id,
      applicationId: application.id,
      sourceType: CandidateEvidenceSourceType.RECRUITER_ENTERED_TEXT,
      origin: CandidateEvidenceOrigin.RECRUITER_ENTERED,
      inlineText: "Replacement evidence",
      contentSha256: `${MARKER}-new`,
    },
  });
  await prisma.candidateEvidence.update({
    where: { id: older.id },
    data: { supersededById: newer.id },
  });
  return { company, user, job, spec, candidate, application, evidence };
}

afterAll(async () => {
  if (companyIds.length === 0) return;
  await prisma.humanRelevanceJudgmentEvidence.deleteMany({
    where: { companyId: { in: companyIds } },
  });
  await prisma.humanRelevanceJudgment.deleteMany({
    where: { companyId: { in: companyIds } },
  });
  await prisma.candidateEvidence.deleteMany({
    where: { companyId: { in: companyIds } },
  });
  await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.job.updateMany({
    where: { companyId: { in: companyIds } },
    data: { currentPublishedSpecificationVersionId: null },
  });
  await prisma.jobSpecificationVersion.deleteMany({
    where: { job: { companyId: { in: companyIds } } },
  });
  await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: MARKER } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
});

describe("blind relevance collection", () => {
  it("returns only published requirements and eligible evidence", async () => {
    const row = await world("blind");
    const other = await world("other");
    const collection = await loadHumanRelevanceCollection({
      companyId: row.company.id,
      jobId: row.job.id,
      applicationId: row.application.id,
    });
    expect(collection?.specificationId).toBe(row.spec.id);
    expect(collection?.requirements).toEqual(["Published Python"]);
    expect(collection?.evidence.map((item) => item.text).sort()).toEqual([
      "Replacement evidence",
      "Used Python in production",
    ]);
    const serialized = JSON.stringify(collection);
    for (const forbidden of [
      "M8",
      "M9",
      "M10",
      "M11",
      "RRF",
      "candidateScore",
      "TECH_EVALUATION",
      "expertScore",
      "99",
      "secret",
      "PROFILE SKILL",
      "LIVE JOB SKILL",
      "REVOKED TEXT",
      "SUPERSEDED TEXT",
      "RELEVANT",
      "NOT_RELEVANT",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(
      await loadHumanRelevanceCollection({
        companyId: other.company.id,
        jobId: row.job.id,
        applicationId: row.application.id,
      }),
    ).toBeNull();
  });

  it("fails closed when the published specification is missing", async () => {
    const row = await world("nospec");
    await prisma.job.update({
      where: { id: row.job.id },
      data: { currentPublishedSpecificationVersionId: null },
    });
    expect(
      await loadHumanRelevanceCollection({
        companyId: row.company.id,
        jobId: row.job.id,
        applicationId: row.application.id,
      }),
    ).toBeNull();
  });

  it("reuses M12 idempotency and does not display prior judgments", async () => {
    const row = await world("write");
    const first = await createHumanRelevanceJudgment({
      reviewerUserId: row.user.id,
      role: PortalRole.CLIENT,
      companyId: row.company.id,
      applicationId: row.application.id,
      jobSpecificationVersionId: row.spec.id,
      label: "RELEVANT",
      idempotencyKey: `${MARKER}-key`,
    });
    const retry = await createHumanRelevanceJudgment({
      reviewerUserId: row.user.id,
      role: PortalRole.CLIENT,
      companyId: row.company.id,
      applicationId: row.application.id,
      jobSpecificationVersionId: row.spec.id,
      label: "NOT_RELEVANT",
      idempotencyKey: `${MARKER}-key`,
    });
    expect(retry.id).toBe(first.id);
    expect(retry.label).toBe("RELEVANT");
    const second = await createHumanRelevanceJudgment({
      reviewerUserId: row.user.id,
      role: PortalRole.CLIENT,
      companyId: row.company.id,
      applicationId: row.application.id,
      jobSpecificationVersionId: row.spec.id,
      label: "NOT_RELEVANT",
      idempotencyKey: `${MARKER}-key-2`,
    });
    expect(second.id).not.toBe(first.id);
    const before = await prisma.humanRelevanceJudgment.findMany({
      where: { applicationId: row.application.id },
      select: { id: true, label: true, supersededById: true },
    });
    const collection = await loadHumanRelevanceCollection({
      companyId: row.company.id,
      jobId: row.job.id,
      applicationId: row.application.id,
    });
    expect(JSON.stringify(collection)).not.toContain("RELEVANT");
    const after = await prisma.humanRelevanceJudgment.findMany({
      where: { applicationId: row.application.id },
      select: { id: true, label: true, supersededById: true },
    });
    expect(after).toEqual(before);
  });
});

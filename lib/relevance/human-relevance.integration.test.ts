import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, describe, expect, it } from "vitest";
import {
  CandidateEvidenceOrigin,
  CandidateEvidenceSourceType,
  CandidateStatus,
  HumanRelevanceLabel,
  JobSpecificationVersionStatus,
  JobStatus,
  PortalRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  HUMAN_RELEVANCE_ALREADY_SUPERSEDED,
  HUMAN_RELEVANCE_FORBIDDEN,
  HUMAN_RELEVANCE_INVALID,
  HUMAN_RELEVANCE_NOT_FOUND,
} from "@/lib/relevance/human-relevance-errors";
import { createHumanRelevanceJudgment } from "@/lib/relevance/human-relevance-operations";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `m12-${process.pid}-${Date.now()}`;

async function world(label: string) {
  const company = await prisma.company.create({
    data: {
      name: `${MARKER} ${label}`,
      industry: "Test",
      employees: 1,
      publicSlug: `${MARKER}-${label}`.toLowerCase(),
    },
  });
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
  await prisma.organizationMember.create({
    data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" },
  });
  const job = await prisma.job.create({
    data: {
      title: `${label} role`,
      status: JobStatus.OPEN,
      companyId: company.id,
      primarySkills: "Python",
    },
  });
  const spec = await prisma.jobSpecificationVersion.create({
    data: {
      jobId: job.id,
      versionNumber: 1,
      status: JobSpecificationVersionStatus.PUBLISHED,
      publishedAt: new Date(),
      title: `${label} role`,
      primarySkills: "Python",
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
      skills: "profile-only",
    },
  });
  const application = await prisma.application.create({
    data: { candidateId: candidate.id, jobId: job.id, companyId: company.id },
  });
  const evidence = await prisma.candidateEvidence.create({
    data: {
      companyId: company.id,
      candidateId: candidate.id,
      applicationId: application.id,
      sourceType: CandidateEvidenceSourceType.RECRUITER_ENTERED_TEXT,
      origin: CandidateEvidenceOrigin.RECRUITER_ENTERED,
      inlineText: "Used Python",
      contentSha256: `${MARKER}-${label}`,
    },
  });
  return { company, user, job, spec, candidate, application, evidence };
}

const createdCompanyIds: number[] = [];

afterAll(async () => {
  if (createdCompanyIds.length === 0) {
    return;
  }
  await prisma.humanRelevanceJudgmentEvidence.deleteMany({
    where: { companyId: { in: createdCompanyIds } },
  });
  await prisma.humanRelevanceJudgment.deleteMany({
    where: { companyId: { in: createdCompanyIds } },
  });
  await prisma.candidateEvidence.deleteMany({
    where: { companyId: { in: createdCompanyIds } },
  });
  await prisma.application.deleteMany({
    where: { companyId: { in: createdCompanyIds } },
  });
  await prisma.candidate.deleteMany({
    where: { companyId: { in: createdCompanyIds } },
  });
  await prisma.job.updateMany({
    where: { companyId: { in: createdCompanyIds } },
    data: { currentPublishedSpecificationVersionId: null },
  });
  await prisma.jobSpecificationVersion.deleteMany({
    where: { job: { companyId: { in: createdCompanyIds } } },
  });
  await prisma.job.deleteMany({
    where: { companyId: { in: createdCompanyIds } },
  });
  await prisma.organizationMember.deleteMany({
    where: { companyId: { in: createdCompanyIds } },
  });
  await prisma.user.deleteMany({
    where: { companyId: { in: createdCompanyIds } },
  });
  await prisma.company.deleteMany({
    where: { id: { in: createdCompanyIds } },
  });
});

describe.skipIf(integrationDatabase.mode === "skip")("human relevance judgments", () => {
  it("keeps client judgments inside the company and preserves history", async () => {
    const a = await world("a");
    const b = await world("b");
    createdCompanyIds.push(a.company.id, b.company.id);
    const second = await prisma.user.create({
      data: {
        email: `${MARKER}-a2@hireiq.test`,
        name: "Second",
        role: PortalRole.CLIENT,
        passwordHash: "test",
        emailVerifiedAt: new Date(),
        companyId: a.company.id,
      },
    });

    const relevant = await createHumanRelevanceJudgment({
      reviewerUserId: a.user.id,
      role: PortalRole.CLIENT,
      companyId: a.company.id,
      applicationId: a.application.id,
      jobSpecificationVersionId: a.spec.id,
      label: "RELEVANT",
      idempotencyKey: `${MARKER}-relevant`,
    });
    const retry = await createHumanRelevanceJudgment({
      reviewerUserId: a.user.id,
      role: PortalRole.CLIENT,
      companyId: a.company.id,
      applicationId: a.application.id,
      jobSpecificationVersionId: a.spec.id,
      label: "NOT_RELEVANT",
      idempotencyKey: `${MARKER}-relevant`,
    });
    expect(retry.id).toBe(relevant.id);
    expect(retry.label).toBe(HumanRelevanceLabel.RELEVANT);

    const other = await createHumanRelevanceJudgment({
      reviewerUserId: second.id,
      role: PortalRole.CLIENT,
      companyId: a.company.id,
      applicationId: a.application.id,
      jobSpecificationVersionId: a.spec.id,
      label: "NOT_RELEVANT",
      idempotencyKey: `${MARKER}-other`,
    });
    expect(other.id).not.toBe(relevant.id);

    const correction = await createHumanRelevanceJudgment({
      reviewerUserId: a.user.id,
      role: PortalRole.CLIENT,
      companyId: a.company.id,
      applicationId: a.application.id,
      jobSpecificationVersionId: a.spec.id,
      label: "NOT_RELEVANT",
      idempotencyKey: `${MARKER}-correction`,
      supersedesJudgmentId: relevant.id,
    });
    const prior = await prisma.humanRelevanceJudgment.findUnique({
      where: { id: relevant.id },
    });
    expect(prior?.label).toBe(HumanRelevanceLabel.RELEVANT);
    expect(prior?.supersededById).toBe(correction.id);
    await expect(
      createHumanRelevanceJudgment({
        reviewerUserId: a.user.id,
        role: PortalRole.CLIENT,
        companyId: a.company.id,
        applicationId: a.application.id,
        jobSpecificationVersionId: a.spec.id,
        label: "RELEVANT",
        idempotencyKey: `${MARKER}-again`,
        supersedesJudgmentId: relevant.id,
      }),
    ).rejects.toMatchObject({ code: HUMAN_RELEVANCE_ALREADY_SUPERSEDED });

    await expect(
      createHumanRelevanceJudgment({
        reviewerUserId: b.user.id,
        role: PortalRole.CLIENT,
        companyId: b.company.id,
        applicationId: a.application.id,
        jobSpecificationVersionId: a.spec.id,
        label: "RELEVANT",
        idempotencyKey: `${MARKER}-cross`,
      }),
    ).rejects.toMatchObject({ code: HUMAN_RELEVANCE_NOT_FOUND });

    await expect(
      createHumanRelevanceJudgment({
        reviewerUserId: a.user.id,
        role: PortalRole.ADMIN,
        companyId: a.company.id,
        applicationId: a.application.id,
        jobSpecificationVersionId: a.spec.id,
        label: "RELEVANT",
        idempotencyKey: `${MARKER}-admin`,
      }),
    ).rejects.toMatchObject({ code: HUMAN_RELEVANCE_FORBIDDEN });

    await expect(
      createHumanRelevanceJudgment({
        reviewerUserId: a.user.id,
        role: PortalRole.CLIENT,
        companyId: a.company.id,
        applicationId: a.application.id,
        jobSpecificationVersionId: a.spec.id,
        label: "MAYBE",
        idempotencyKey: `${MARKER}-bad`,
        forbidden: { candidateScore: 10 },
      }),
    ).rejects.toMatchObject({ code: HUMAN_RELEVANCE_INVALID });

    const status = await prisma.application.findUnique({
      where: { id: a.application.id },
      select: { status: true },
    });
    expect(status?.status).toBe("CV_POOL");
    const refs = await prisma.humanRelevanceJudgmentEvidence.findMany({
      where: { judgmentId: relevant.id },
    });
    expect(refs.map((row) => row.evidenceId)).toEqual([a.evidence.id]);
    expect(refs[0]?.contentSha256).toBe(a.evidence.contentSha256);
    expect(JSON.stringify(refs)).not.toContain("inlineText");
  });
});

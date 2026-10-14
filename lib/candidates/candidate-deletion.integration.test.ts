import "@/lib/evidence-graph/evidence-graph-test-env";

import { readFileSync } from "fs";
import { join } from "path";

import { afterAll, describe, expect, it } from "vitest";
import {
  CandidateEvidenceOrigin,
  CandidateEvidenceSourceType,
  CandidateIdentitySignalKind,
  CandidateStatus,
  JobSpecificationVersionStatus,
  JobStatus,
  PortalRole,
  Prisma,
} from "@prisma/client";

import {
  CANDIDATE_DELETION_REFUSED,
  CandidateDeletionRefused,
  deleteUnattachedCandidate,
  refusalFromDeleteError,
} from "@/lib/candidates/candidate-deletion";
import { prisma } from "@/lib/prisma";

const MARKER = `del-${process.pid}-${Date.now()}`;
const companyIds: number[] = [];

async function bareCandidate(label: string) {
  const company = await prisma.company.create({
    data: {
      name: `${MARKER} ${label}`,
      industry: "Test",
      employees: 1,
      publicSlug: `${MARKER}-${label}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
    },
  });
  companyIds.push(company.id);
  const candidate = await prisma.candidate.create({
    data: {
      name: `${label} person`,
      role: "Engineer",
      experienceYears: 1,
      status: CandidateStatus.APPLIED,
      companyId: company.id,
    },
  });
  return { company, candidate };
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
  await prisma.candidateIdentitySignal.deleteMany({
    where: { companyId: { in: companyIds } },
  });
  await prisma.candidateIdentityMembership.deleteMany({
    where: { companyId: { in: companyIds } },
  });
  await prisma.companyPerson.deleteMany({
    where: { companyId: { in: companyIds } },
  });
  await prisma.candidateProfile.deleteMany({
    where: { companyId: { in: companyIds } },
  });
  await prisma.application.deleteMany({
    where: { companyId: { in: companyIds } },
  });
  await prisma.candidate.deleteMany({
    where: { companyId: { in: companyIds } },
  });
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

describe("ordinary candidate deletion", () => {
  it("refuses a candidate with an application and leaves both rows", async () => {
    const { company, candidate } = await bareCandidate("app");
    const job = await prisma.job.create({
      data: { title: "Role", status: JobStatus.OPEN, companyId: company.id },
    });
    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        companyId: company.id,
      },
    });

    await expect(deleteUnattachedCandidate(candidate.id)).rejects.toBeInstanceOf(
      CandidateDeletionRefused,
    );
    expect(
      await prisma.candidate.findUnique({ where: { id: candidate.id } }),
    ).not.toBeNull();
    expect(
      await prisma.application.findUnique({ where: { id: application.id } }),
    ).not.toBeNull();
  });

  it("refuses a candidate with evidence", async () => {
    const { company, candidate } = await bareCandidate("evidence");
    await prisma.candidateEvidence.create({
      data: {
        companyId: company.id,
        candidateId: candidate.id,
        sourceType: CandidateEvidenceSourceType.RECRUITER_ENTERED_TEXT,
        origin: CandidateEvidenceOrigin.RECRUITER_ENTERED,
        inlineText: "note",
      },
    });
    await expect(deleteUnattachedCandidate(candidate.id)).rejects.toThrow(
      CANDIDATE_DELETION_REFUSED,
    );
    expect(
      await prisma.candidateEvidence.count({ where: { candidateId: candidate.id } }),
    ).toBe(1);
  });

  it("refuses a candidate with a human relevance judgment", async () => {
    const { company, candidate } = await bareCandidate("judgment");
    const job = await prisma.job.create({
      data: { title: "Role", status: JobStatus.OPEN, companyId: company.id },
    });
    const spec = await prisma.jobSpecificationVersion.create({
      data: {
        jobId: job.id,
        versionNumber: 1,
        status: JobSpecificationVersionStatus.PUBLISHED,
        title: "Role",
      },
    });
    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        companyId: company.id,
      },
    });
    const user = await prisma.user.create({
      data: {
        email: `${MARKER}-reviewer@hireiq.test`,
        name: "Reviewer",
        role: PortalRole.CLIENT,
        passwordHash: "test",
      },
    });
    await prisma.humanRelevanceJudgment.create({
      data: {
        companyId: company.id,
        jobId: job.id,
        applicationId: application.id,
        candidateId: candidate.id,
        jobSpecificationVersionId: spec.id,
        reviewerUserId: user.id,
        protocolVersion: "v1-human-relevance",
        label: "RELEVANT",
        idempotencyKey: `${MARKER}-judgment`,
      },
    });

    await expect(deleteUnattachedCandidate(candidate.id)).rejects.toBeInstanceOf(
      CandidateDeletionRefused,
    );
    expect(
      await prisma.humanRelevanceJudgment.count({
        where: { candidateId: candidate.id },
      }),
    ).toBe(1);
  });

  it("refuses a profile-only candidate and an identity-signal candidate", async () => {
    const profileOnly = await bareCandidate("profile");
    await prisma.candidateProfile.create({
      data: {
        candidateId: profileOnly.candidate.id,
        companyId: profileOnly.company.id,
      },
    });
    await expect(
      deleteUnattachedCandidate(profileOnly.candidate.id),
    ).rejects.toBeInstanceOf(CandidateDeletionRefused);
    expect(
      await prisma.candidateProfile.count({
        where: { candidateId: profileOnly.candidate.id },
      }),
    ).toBe(1);

    const signalOnly = await bareCandidate("signal");
    await prisma.candidateIdentitySignal.create({
      data: {
        companyId: signalOnly.company.id,
        candidateId: signalOnly.candidate.id,
        kind: CandidateIdentitySignalKind.EMAIL,
        normalizedValue: `${MARKER}-signal@hireiq.test`,
      },
    });
    await expect(
      deleteUnattachedCandidate(signalOnly.candidate.id),
    ).rejects.toBeInstanceOf(CandidateDeletionRefused);
    expect(
      await prisma.candidateIdentitySignal.count({
        where: { candidateId: signalOnly.candidate.id },
      }),
    ).toBe(1);

    const memberOnly = await bareCandidate("member");
    const person = await prisma.companyPerson.create({
      data: { companyId: memberOnly.company.id },
    });
    await prisma.candidateIdentityMembership.create({
      data: {
        companyId: memberOnly.company.id,
        candidateId: memberOnly.candidate.id,
        companyPersonId: person.id,
      },
    });
    await expect(
      deleteUnattachedCandidate(memberOnly.candidate.id),
    ).rejects.toBeInstanceOf(CandidateDeletionRefused);
    expect(
      await prisma.candidateIdentityMembership.count({
        where: { candidateId: memberOnly.candidate.id },
      }),
    ).toBe(1);
  });

  it("deletes a candidate with no dependent records", async () => {
    const { candidate } = await bareCandidate("empty");
    await deleteUnattachedCandidate(candidate.id);
    expect(
      await prisma.candidate.findUnique({ where: { id: candidate.id } }),
    ).toBeNull();
  });

  it("maps only foreign-key delete failures to the product refusal", () => {
    const foreignKey = new Prisma.PrismaClientKnownRequestError("fk", {
      code: "P2003",
      clientVersion: "test",
    });
    const missing = new Prisma.PrismaClientKnownRequestError("missing", {
      code: "P2025",
      clientVersion: "test",
    });
    expect(refusalFromDeleteError(foreignKey)).toBeInstanceOf(
      CandidateDeletionRefused,
    );
    expect(refusalFromDeleteError(missing)).toBeNull();
    expect(refusalFromDeleteError(new Error("database offline"))).toBeNull();
  });

  it("keeps admin authorization on the delete action", () => {
    const source = readFileSync(
      join(process.cwd(), "app/actions/candidate-actions.ts"),
      "utf8",
    );
    const start = source.indexOf("export async function deleteCandidate");
    const body = source.slice(start);
    expect(body).toContain("await requireAdmin()");
    expect(body).toContain("deleteUnattachedCandidate");
  });
});

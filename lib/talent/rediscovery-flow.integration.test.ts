import { afterAll, describe, expect, it, vi } from "vitest";
import { CandidateStatus, JobStatus } from "@prisma/client";

vi.mock("@/auth", () => ({ auth: async () => null }));

import { prisma } from "@/lib/prisma";
import { withAIRun } from "@/lib/ai/run";
import { acceptRediscoveryInvite, askPastApplicantsToOptIn, inviteRediscoveredCandidate, runTalentRediscovery } from "@/lib/talent/rediscovery-service";
import { TALENT_REDISCOVERY_FEATURE } from "@/lib/talent/rediscovery";

const MARKER = `rediscover-${Date.now()}`;

describe("talent rediscovery flow", () => {
  const companyIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.talentRediscoveryInvite.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.talentRediscoveryAction.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.talentRediscoveryRun.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidateClaim.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidateIntelligenceRun.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidateEvidence.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidatePortalIdentity.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.jobSpecificationVersion.deleteMany({ where: { job: { companyId: { in: companyIds } } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
  });

  it("reuses matcher coverage, invites without an application, and caches a new spec version", async () => {
    const company = await prisma.company.create({
      data: { name: MARKER, industry: "Test", employees: 1, publicSlug: MARKER },
    });
    companyIds.push(company.id);
    const admin = await prisma.user.create({
      data: { email: `${MARKER}@hireiq.test`, name: "Admin", role: "ADMIN", passwordHash: "x", emailVerifiedAt: new Date() },
    });
    const previous = await prisma.job.create({ data: { title: "Earlier role", status: JobStatus.OPEN, companyId: company.id } });
    const job = await prisma.job.create({ data: { title: "New role", status: JobStatus.OPEN, companyId: company.id, primarySkills: "Go" } });
    const spec = await prisma.jobSpecificationVersion.create({
      data: { jobId: job.id, versionNumber: 1, status: "PUBLISHED", title: "New role", primarySkills: "Go" },
    });
    await prisma.job.update({ where: { id: job.id }, data: { currentPublishedSpecificationVersionId: spec.id } });
    const candidate = await prisma.candidate.create({
      data: { name: "Ada", role: "Engineer", experienceYears: 6, status: CandidateStatus.APPLIED, companyId: company.id },
    });
    await prisma.application.create({
      data: { candidateId: candidate.id, jobId: previous.id, companyId: company.id, futureRolesConsent: true, status: "SHORTLISTED" },
    });
    const evidence = await prisma.candidateEvidence.create({
      data: { companyId: company.id, candidateId: candidate.id, sourceType: "RESUME_DOCUMENT", origin: "CANDIDATE_PROVIDED", inlineText: "Go and Kubernetes" },
    });
    const run = await prisma.candidateIntelligenceRun.create({
      data: {
        companyId: company.id,
        candidateId: candidate.id,
        evidenceId: evidence.id,
        status: "COMPLETED",
        extractorType: "DETERMINISTIC_TEXT_V1",
        extractorVersion: "v1",
        modelProvider: "none",
        modelName: "none",
        promptVersion: "none",
        completedAt: new Date(),
      },
    });
    await prisma.candidateClaim.create({
      data: { companyId: company.id, candidateId: candidate.id, runId: run.id, evidenceId: evidence.id, claimType: "SKILL", value: "Go", normalizedValue: "golang" },
    });
    await prisma.candidatePortalIdentity.create({
      data: { emailNormalized: `${MARKER}@hireiq.test`, candidateId: candidate.id, companyId: company.id },
    });

    const found = await runTalentRediscovery({ jobId: job.id });
    expect(found.map((row) => row.candidateId)).toContain(candidate.id);
    expect(found[0]?.coverage).toBeGreaterThan(0);

    expect(await prisma.application.count({ where: { candidateId: candidate.id, jobId: job.id } })).toBe(0);
    const url = await inviteRediscoveredCandidate({ jobId: job.id, candidateId: candidate.id, actorUserId: admin.id, origin: "http://localhost:4000" });
    expect(await prisma.application.count({ where: { candidateId: candidate.id, jobId: job.id } })).toBe(0);
    const token = url.split("/").pop() ?? "";
    const accepted = await acceptRediscoveryInvite(token);
    expect(accepted?.jobId).toBe(job.id);
    const audit = await prisma.auditLog.findFirst({ where: { companyId: company.id, action: "REDISCOVERY_INVITED" } });
    expect(audit?.targetId).toBe(candidate.id);

    const next = await prisma.jobSpecificationVersion.create({
      data: { jobId: job.id, versionNumber: 2, status: "PUBLISHED", title: "New role", primarySkills: "Go" },
    });
    await prisma.job.update({ where: { id: job.id }, data: { currentPublishedSpecificationVersionId: next.id } });
    await runTalentRediscovery({ jobId: job.id });
    expect(await prisma.talentRediscoveryRun.count({ where: { jobId: job.id } })).toBe(2);

    const created: unknown[] = [];
    await withAIRun(TALENT_REDISCOVERY_FEATURE, null, {
      companyId: company.id,
      entityType: "Job",
      entityId: job.id,
      model: "text-embedding-3-small",
      promptVersion: "v1",
      input: { q: "Go" },
      db: { aIRun: { create: async ({ data }) => { created.push(data); return data; } } },
    }, async () => ({ value: true, promptTokens: 1, completionTokens: 0, output: { ok: true } }));
    expect(created).toHaveLength(1);
  });

  it("emails a past applicant once to opt in, and skips anyone who already consented", async () => {
    const company = await prisma.company.create({
      data: { name: `${MARKER}-ask`, industry: "Test", employees: 1, publicSlug: `${MARKER}-ask` },
    });
    companyIds.push(company.id);
    const admin = await prisma.user.create({
      data: { email: `${MARKER}-ask@hireiq.test`, name: "Admin", role: "ADMIN", passwordHash: "x", emailVerifiedAt: new Date() },
    });
    const job = await prisma.job.create({ data: { title: "Old role", status: JobStatus.OPEN, companyId: company.id } });
    const pending = await prisma.candidate.create({
      data: { name: "No consent yet", role: "Engineer", experienceYears: 4, status: CandidateStatus.APPLIED, companyId: company.id },
    });
    const consented = await prisma.candidate.create({
      data: { name: "Already yes", role: "Engineer", experienceYears: 4, status: CandidateStatus.APPLIED, companyId: company.id },
    });
    await prisma.application.create({ data: { candidateId: pending.id, jobId: job.id, companyId: company.id, futureRolesConsent: false } });
    await prisma.application.create({ data: { candidateId: consented.id, jobId: job.id, companyId: company.id, futureRolesConsent: true } });
    await prisma.candidatePortalIdentity.create({ data: { emailNormalized: `${MARKER}-pending@hireiq.test`, candidateId: pending.id, companyId: company.id } });
    await prisma.candidatePortalIdentity.create({ data: { emailNormalized: `${MARKER}-yes@hireiq.test`, candidateId: consented.id, companyId: company.id } });

    const first = await askPastApplicantsToOptIn({ companyId: company.id, actorUserId: admin.id, origin: "http://localhost:4000" });
    const second = await askPastApplicantsToOptIn({ companyId: company.id, actorUserId: admin.id, origin: "http://localhost:4000" });
    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    expect((await prisma.candidate.findUnique({ where: { id: pending.id } }))?.futureRolesAskedAt).not.toBeNull();
    expect((await prisma.candidate.findUnique({ where: { id: consented.id } }))?.futureRolesAskedAt).toBeNull();
    expect(await prisma.auditLog.count({ where: { companyId: company.id, action: "FUTURE_ROLES_ASKED" } })).toBe(1);
  });
});

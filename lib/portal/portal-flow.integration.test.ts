import { afterAll, describe, expect, it, vi } from "vitest";
import { CandidateStatus, JobStatus } from "@prisma/client";

vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/resumes/text-extraction", () => ({
  extractResumeText: async () => ({ ok: true, text: "Go and Postgres for nine years.", quality: {}, extractor: "test" }),
}));

import { prisma } from "@/lib/prisma";
import {
  consumeMagicLink,
  createMagicLink,
  exportPortalData,
  issuePortalBookingLink,
  queueDeletion,
  rememberPortalIdentity,
  savePortalDocument,
  setOptOut,
  withdrawApplication,
} from "@/lib/portal/portal-service";

const MARKER = `portal-${Date.now()}`;

describe("candidate portal flow", () => {
  const companyIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.candidateDeletionRequest.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidatePortalDocument.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.interviewBookingInvite.deleteMany({ where: { application: { companyId: { in: companyIds } } } });
    await prisma.candidateIntelligenceRun.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidateEvidence.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidatePortalIdentity.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.portalLoginLink.deleteMany({ where: { emailNormalized: `${MARKER}@hireiq.test` } });
  });

  it("covers link expiry, upload, reschedule, opt-out, export, deletion, and withdraw", async () => {
    const company = await prisma.company.create({
      data: { name: MARKER, industry: "Test", employees: 1, publicSlug: MARKER },
    });
    companyIds.push(company.id);
    await prisma.user.create({
      data: {
        email: `admin-${MARKER}@hireiq.test`,
        name: "Admin",
        role: "ADMIN",
        passwordHash: "not-a-login",
        emailVerifiedAt: new Date(),
      },
    });
    const job = await prisma.job.create({
      data: { title: "Backend", status: JobStatus.OPEN, companyId: company.id },
    });
    const candidate = await prisma.candidate.create({
      data: { name: "Ada", role: "Engineer", experienceYears: 4, status: CandidateStatus.APPLIED, companyId: company.id },
    });
    const application = await prisma.application.create({
      data: { candidateId: candidate.id, jobId: job.id, companyId: company.id, status: "TECH_EVALUATION" },
    });
    const email = `${MARKER}@hireiq.test`;
    await rememberPortalIdentity(email, candidate.id, company.id);
    const evidence = await prisma.candidateEvidence.create({
      data: {
        companyId: company.id,
        candidateId: candidate.id,
        applicationId: application.id,
        sourceType: "RESUME_DOCUMENT",
        origin: "CANDIDATE_PROVIDED",
        inlineText: "Go",
      },
    });
    await prisma.candidateIntelligenceRun.create({
      data: {
        companyId: company.id,
        candidateId: candidate.id,
        evidenceId: evidence.id,
        status: "RUNNING",
        extractorType: "DETERMINISTIC_TEXT_V1",
        extractorVersion: "v1",
        modelProvider: "none",
        modelName: "none",
        promptVersion: "none",
      },
    });

    const link = await createMagicLink(email, "http://localhost:4000");
    expect(link).not.toBeNull();
    expect(await consumeMagicLink(link!.rawToken)).toMatchObject({ email });
    expect(await consumeMagicLink(link!.rawToken)).toBeNull();
    await prisma.portalLoginLink.update({
      where: { tokenHash: (await import("@/lib/auth/secure-token")).hashSecureToken(link!.rawToken) },
      data: { consumedAt: null, expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await consumeMagicLink(link!.rawToken)).toBeNull();

    const unknown = `missing-${MARKER}@hireiq.test`;
    expect(await createMagicLink(unknown, "http://localhost:4000")).toBeNull();
    expect(await prisma.portalLoginLink.count({ where: { emailNormalized: unknown } })).toBe(0);

    const first = await savePortalDocument({
      email,
      applicationId: application.id,
      kind: "RESUME",
      fileName: "cv.pdf",
      contentType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4 resume"),
    });
    const second = await savePortalDocument({
      email,
      applicationId: application.id,
      kind: "RESUME",
      fileName: "cv-2.pdf",
      contentType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4 replacement"),
    });
    expect(first).toMatchObject({ parseMessage: "We read this file." });
    expect(second).toMatchObject({ parseMessage: "We read this file." });
    const docs = await prisma.candidatePortalDocument.findMany({ where: { applicationId: application.id }, orderBy: { id: "asc" } });
    expect(docs[0]?.replacedAt).not.toBeNull();
    expect(docs[1]?.replacedAt).toBeNull();
    expect(docs[1]?.parseStatus).toBe("PARSED");

    const booking = await issuePortalBookingLink(email, application.id, "http://localhost:4000");
    expect(booking).toMatch(/^http:\/\/localhost:4000\/schedule\//);

    await setOptOut(application.id, email, true);
    const opted = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
    expect(opted.aiEvaluationOptOut).toBe(true);
    const run = await prisma.candidateIntelligenceRun.findFirstOrThrow({ where: { evidenceId: evidence.id } });
    expect(run.status).toBe("FAILED");

    const exported = await exportPortalData(email);
    expect(JSON.stringify(exported)).not.toMatch(/score/i);
    expect(exported.applications[0]?.job).toBe("Backend");
    expect(exported.applications[0]?.documents[0]?.fileName).toBe("cv-2.pdf");

    const deletionId = await queueDeletion(application.id, email);
    expect(deletionId).toBeGreaterThan(0);
    await withdrawApplication(application.id, email, "Accepted another offer");
    const withdrawn = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
    expect(withdrawn.withdrawReason).toMatch(/another offer/);
    const audits = await prisma.auditLog.findMany({
      where: { companyId: company.id },
      select: { action: true },
    });
    expect(audits.map((row) => row.action)).toEqual(expect.arrayContaining([
      "DOCUMENT_UPLOADED",
      "INTERVIEW_RESCHEDULE_LINK",
      "AI_OPT_OUT",
      "DELETION_REQUESTED",
      "APPLICATION_WITHDRAWN",
    ]));
  });
});

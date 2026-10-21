import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, describe, expect, it } from "vitest";
import {
  ApplicationPipelineStatus,
  CandidateStatus,
  HostedResumeParseStatus,
  JobStatus,
} from "@prisma/client";
import { claimPendingResumeInIngestion } from "@/lib/apply/hosted-resume-service";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `lq-${process.pid}-${Date.now()}`;

describe.skipIf(integrationDatabase.mode === "skip")("low-quality resume ingestion", () => {
  const companyIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    const where = { companyId: { in: companyIds } };
    await prisma.candidateEvidence.deleteMany({ where });
    await prisma.candidateResumeDocument.deleteMany({ where });
    await prisma.hostedApplyResumeUpload.deleteMany({ where });
    await prisma.hostedApplySubmission.deleteMany({ where });
    await prisma.applyToken.deleteMany({ where: { distribution: where } });
    await prisma.jobDistribution.deleteMany({ where });
    await prisma.application.deleteMany({ where });
    await prisma.candidate.deleteMany({ where });
    await prisma.job.updateMany({
      where,
      data: { currentPublishedSpecificationVersionId: null },
    });
    await prisma.jobSpecificationVersion.deleteMany({ where: { job: where } });
    await prisma.job.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  it("keeps LOW_QUALITY off candidate evidence and still records a clean resume", async () => {
    const company = await prisma.company.create({
      data: {
        name: `${MARKER} co`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    companyIds.push(company.id);
    const job = await prisma.job.create({
      data: { title: `${MARKER} role`, status: JobStatus.OPEN, companyId: company.id },
    });
    const spec = await prisma.jobSpecificationVersion.create({
      data: { jobId: job.id, versionNumber: 1, status: "DRAFT", title: job.title },
    });
    const distribution = await prisma.jobDistribution.create({
      data: {
        companyId: company.id,
        jobId: job.id,
        jobSpecificationVersionId: spec.id,
        provider: "MANUAL",
        applyMode: "HIREIQ_HOSTED",
      },
    });
    const token = await prisma.applyToken.create({
      data: { distributionId: distribution.id, tokenHash: `${MARKER}-token` },
    });
    const candidate = await prisma.candidate.create({
      data: {
        name: `${MARKER} candidate`,
        role: "Engineer",
        experienceYears: 2,
        status: CandidateStatus.APPLIED,
        companyId: company.id,
      },
    });
    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        companyId: company.id,
        status: ApplicationPipelineStatus.CV_POOL,
      },
    });

    async function submission(label: string) {
      return prisma.hostedApplySubmission.create({
        data: {
          applyTokenId: token.id,
          distributionId: distribution.id,
          companyId: company.id,
          jobId: job.id,
          jobSpecificationVersionId: spec.id,
          idempotencyKey: `${MARKER}-${label}`,
          emailNormalized: `${MARKER}-${label}@hireiq.test`.toLowerCase(),
          name: label,
          consentAcceptedAt: new Date(),
        },
      });
    }

    const weak = await submission("weak");
    const clean = await submission("clean");
    await prisma.hostedApplyResumeUpload.create({
      data: {
        distributionId: distribution.id,
        jobId: job.id,
        companyId: company.id,
        applyTokenHash: token.tokenHash,
        hostedApplySubmissionId: weak.id,
        claimTokenHash: `${MARKER}-weak-claim`,
        storageKey: `${MARKER}-weak-file`,
        fileName: "weak.pdf",
        contentType: "application/pdf",
        sizeBytes: 12,
        contentSha256: "a".repeat(64),
        parseStatus: HostedResumeParseStatus.PARSED,
        extractedText: "garbled",
        parseErrorCode: "LOW_QUALITY",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.hostedApplyResumeUpload.create({
      data: {
        distributionId: distribution.id,
        jobId: job.id,
        companyId: company.id,
        applyTokenHash: token.tokenHash,
        hostedApplySubmissionId: clean.id,
        claimTokenHash: `${MARKER}-clean-claim`,
        storageKey: `${MARKER}-clean-file`,
        fileName: "clean.pdf",
        contentType: "application/pdf",
        sizeBytes: 20,
        contentSha256: "b".repeat(64),
        parseStatus: HostedResumeParseStatus.PARSED,
        extractedText: "Pat worked at Harbor as an engineer.",
        parseErrorCode: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const input = {
      companyId: company.id,
      candidateId: candidate.id,
      applicationId: application.id,
      occurredAt: new Date(),
    };
    await prisma.$transaction((tx) => claimPendingResumeInIngestion(tx, weak.id, input));
    await prisma.$transaction((tx) => claimPendingResumeInIngestion(tx, clean.id, input));

    const weakDoc = await prisma.candidateResumeDocument.findFirstOrThrow({
      where: { storageKey: `${MARKER}-weak-file` },
    });
    expect(weakDoc.parseStatus).toBe("READY");
    expect(weakDoc.parseErrorCode).toBe("LOW_QUALITY");
    expect(
      await prisma.candidateEvidence.count({
        where: { applicationId: application.id, sourceType: "RESUME_DOCUMENT", inlineText: "garbled" },
      }),
    ).toBe(0);

    const cleanDoc = await prisma.candidateResumeDocument.findFirstOrThrow({
      where: { storageKey: `${MARKER}-clean-file` },
    });
    expect(cleanDoc.parseStatus).toBe("READY");
    expect(cleanDoc.parseErrorCode).toBeNull();
    expect(
      await prisma.candidateEvidence.count({
        where: {
          applicationId: application.id,
          sourceType: "RESUME_DOCUMENT",
          inlineText: "Pat worked at Harbor as an engineer.",
        },
      }),
    ).toBe(1);
  });
});

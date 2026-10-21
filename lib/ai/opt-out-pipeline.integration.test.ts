import { afterAll, describe, expect, it, vi } from "vitest";
import { CandidateStatus, JobStatus } from "@prisma/client";
import { assertAIEvaluationAllowed, stopQueuedAiEvaluation } from "@/lib/ai/opt-out";
import { submitGeneratedAssessment } from "@/lib/assessments/generated-assessment-service";
import { executeRunDeterministicIntelligence } from "@/lib/candidates/intelligence/deterministic-intelligence-service";
import { executeRunCandidateMatching } from "@/lib/candidates/matching/matching-service";
import { quotesForVagueRequirements } from "@/lib/jobs/requirement-checks";
import { prisma } from "@/lib/prisma";
import { scoreLabel } from "@/lib/review/review-queue";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

vi.mock("@/auth", () => ({ auth: async () => null }));










const MARKER = `optout-${Date.now()}`;

describe.skipIf(integrationDatabase.mode === "skip")("opted-out evaluation", () => {
  const companyIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.generatedAssessmentInvite.deleteMany({ where: { assessment: { companyId: { in: companyIds } } } });
    await prisma.generatedAssessment.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidateIntelligenceRun.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidateEvidence.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.aIRun.deleteMany({ where: { companyId: { in: companyIds } } });
  });

  it("skips model calls and shows manual review", async () => {
    const company = await prisma.company.create({
      data: { name: MARKER, industry: "Test", employees: 1, publicSlug: MARKER },
    });
    companyIds.push(company.id);
    const job = await prisma.job.create({
      data: { title: "Backend", status: JobStatus.OPEN, companyId: company.id },
    });
    const candidate = await prisma.candidate.create({
      data: { name: "Opt Out", role: "Engineer", experienceYears: 4, status: CandidateStatus.APPLIED, companyId: company.id },
    });
    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        companyId: company.id,
        aiEvaluationOptOut: true,
        aiOptOutAt: new Date(),
      },
    });
    const evidence = await prisma.candidateEvidence.create({
      data: {
        companyId: company.id,
        candidateId: candidate.id,
        applicationId: application.id,
        sourceType: "RESUME_DOCUMENT",
        origin: "CANDIDATE_PROVIDED",
        inlineText: "Nine years of Go and Postgres.",
      },
    });
    const running = await prisma.candidateIntelligenceRun.create({
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

    await expect(assertAIEvaluationAllowed({ applicationId: application.id })).rejects.toThrow(/opted out/);
    await expect(
      executeRunDeterministicIntelligence({ candidateId: candidate.id, evidenceId: evidence.id }),
    ).rejects.toThrow(/opted out/);
    await expect(
      executeRunCandidateMatching({ applicationId: application.id, jobSpecificationVersionId: 1 }),
    ).rejects.toThrow(/opted out|Manual review/);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const quotes = await quotesForVagueRequirements("Nine years of Go.", ["Clear written design"], {
      companyId: company.id,
      applicationId: application.id,
    });
    expect(quotes).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();

    await stopQueuedAiEvaluation(application.id);
    const stopped = await prisma.candidateIntelligenceRun.findUniqueOrThrow({ where: { id: running.id } });
    expect(stopped.status).toBe("FAILED");
    expect(stopped.errorCode).toBe("AI_EVALUATION_OPT_OUT");

    const assessment = await prisma.generatedAssessment.create({
      data: {
        jobId: job.id,
        companyId: company.id,
        version: 1,
        status: "PUBLISHED",
        items: Array.from({ length: 6 }, (_, index) => ({
          id: `item-${index + 1}`,
          type: "short_answer",
          prompt: "Explain one production tradeoff you owned.",
          requirement: "Communication",
          rubricCriterion: "Communication",
        })),
      },
    });
    const token = `opt-out-${MARKER}`;
    await prisma.generatedAssessmentInvite.create({
      data: {
        applicationId: application.id,
        assessmentId: assessment.id,
        tokenHash: (await import("@/lib/auth/secure-token")).hashSecureToken(token),
        itemOrder: ["item-1", "item-2", "item-3", "item-4", "item-5", "item-6"],
        answers: { "item-1": "I shipped Postgres indexes and explained the tradeoff to the team." },
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await submitGeneratedAssessment(token, null);
    const invite = await prisma.generatedAssessmentInvite.findFirstOrThrow({
      where: { applicationId: application.id },
    });
    const grades = invite.grades as Array<{ needsHuman?: boolean; score?: number | null }>;
    expect(grades[0]?.needsHuman).toBe(true);
    expect(grades[0]?.score).toBeNull();

    expect(await prisma.aIRun.count({ where: { companyId: company.id } })).toBe(0);
    expect(scoreLabel({ optedOut: true, score: 0.9, analysed: true })).toBe("Manual review");
  });
});

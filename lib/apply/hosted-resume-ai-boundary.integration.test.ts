import "@/lib/evidence-graph/evidence-graph-test-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { JobStatus, ResumeParseStatus } from "@prisma/client";
import { setGatewayFetchForTests } from "@/lib/ai/gateway";
import { hashSecureToken } from "@/lib/auth/secure-token";
import { submitGeneratedAssessment } from "@/lib/assessments/generated-assessment-service";
import { submitHostedApply } from "@/lib/apply/hosted-apply-service";
import { storePendingHostedResume } from "@/lib/apply/hosted-resume-service";
import { generateSecureToken } from "@/lib/auth/secure-token";
import { setOptOut } from "@/lib/portal/portal-service";
import { prisma } from "@/lib/prisma";
import { transcribeResumePage, type ResumeVisionAudit } from "@/lib/resumes/layout-vision";
import { finishCandidateResumeParse, finishHostedResumeParse } from "@/lib/resumes/resume-parse-job";
import { buildResumeStorageKey, storeResume } from "@/lib/resumes/storage";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `aib-${process.pid}-${Date.now()}`;
const RESUME = [
  "Sam Rivera",
  "sam.rivera@example.test",
  "Backend engineer at Harbor Logistics, 2019 - 2024",
  "Built a streaming CSV importer in TypeScript with retries and schema validation.",
  "Skills: TypeScript, PostgreSQL, Node.js, testing, observability",
].join("\n");

let calls: string[] = [];
const saved = { openai: process.env.OPENAI_API_KEY, skip: process.env.HIREIQ_SKIP_RESUME_PARSE };

describe.skipIf(integrationDatabase.mode === "skip")("resume AI boundary before and after the candidate states a preference", () => {
  let companyId = 0;
  let jobId = 0;
  let applyToken = "";

  beforeAll(async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.HIREIQ_SKIP_RESUME_PARSE = "1";
    setGatewayFetchForTests(async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
    });
    const company = await prisma.company.create({
      data: { name: `${MARKER} co`, industry: "Test", employees: 1, publicSlug: MARKER.toLowerCase() },
    });
    companyId = company.id;
    const job = await prisma.job.create({ data: { title: `${MARKER} role`, status: JobStatus.OPEN, companyId } });
    jobId = job.id;
    const spec = await prisma.jobSpecificationVersion.create({
      data: { jobId, versionNumber: 1, status: "PUBLISHED", title: job.title },
    });
    const distribution = await prisma.jobDistribution.create({
      data: { companyId, jobId, jobSpecificationVersionId: spec.id, provider: "MANUAL", applyMode: "HIREIQ_HOSTED", status: "PUBLISHED" },
    });
    const token = generateSecureToken();
    applyToken = token.rawToken;
    await prisma.applyToken.create({ data: { distributionId: distribution.id, tokenHash: token.tokenHash } });
  });

  beforeEach(() => {
    calls = [];
  });

  afterAll(async () => {
    setGatewayFetchForTests(null);
    process.env.OPENAI_API_KEY = saved.openai;
    process.env.HIREIQ_SKIP_RESUME_PARSE = saved.skip;
    if (!companyId) return;
    const where = { companyId };
    const steps: Array<() => Promise<unknown>> = [
      () => prisma.requirementMatch.deleteMany({ where }),
      () => prisma.candidateMatchRun.deleteMany({ where }),
      () => prisma.candidateClaim.deleteMany({ where }),
      () => prisma.candidateIntelligenceRun.deleteMany({ where }),
      () => prisma.candidateEvidence.deleteMany({ where }),
      () => prisma.candidateResumeDocument.deleteMany({ where }),
      () => prisma.hostedApplyResumeUpload.deleteMany({ where }),
      () => prisma.applicationIngestionEvent.deleteMany({ where }),
      () => prisma.hostedApplySubmission.deleteMany({ where }),
      () => prisma.aIRun.deleteMany({ where }),
      () => prisma.application.deleteMany({ where }),
      () => prisma.candidate.deleteMany({ where }),
      () => prisma.applyToken.deleteMany({ where: { distribution: where } }),
      () => prisma.jobDistribution.deleteMany({ where }),
      () => prisma.job.updateMany({ where, data: { currentPublishedSpecificationVersionId: null } }),
      () => prisma.jobSpecificationVersion.deleteMany({ where: { job: where } }),
      () => prisma.job.deleteMany({ where }),
      () => prisma.company.deleteMany({ where: { id: companyId } }),
    ];
    for (let pass = 0; pass < 2; pass += 1) {
      for (const step of steps) await step().catch(() => undefined);
    }
  });

  async function upload() {
    const stored = await storePendingHostedResume({
      applyTokenRaw: applyToken,
      fileName: "resume.txt",
      bytes: Buffer.from(RESUME),
    });
    const row = await prisma.hostedApplyResumeUpload.findFirstOrThrow({
      where: { companyId },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    return { claim: stored.resumeClaim, uploadId: row.id };
  }

  async function apply(label: string, aiEvaluation: string | undefined, resumeClaim: string) {
    await submitHostedApply({
      token: applyToken,
      idempotencyKey: randomUUID(),
      resumeClaim,
      body: { name: label, email: `${MARKER}-${label}@hireiq.test`, consent: true, aiEvaluation },
    });
    return prisma.application.findFirstOrThrow({
      where: { companyId, candidate: { name: label } },
      select: { id: true, candidateId: true, aiEvaluationOptOut: true, aiOptOutAt: true },
    });
  }

  async function reprocess(applicationId: number) {
    const document = await prisma.candidateResumeDocument.findFirstOrThrow({ where: { applicationId } });
    await prisma.candidateResumeDocument.update({ where: { id: document.id }, data: { parseStatus: ResumeParseStatus.PARSING } });
    await finishCandidateResumeParse(document.id);
    return prisma.candidateResumeDocument.findUniqueOrThrow({ where: { id: document.id } });
  }

  it("reads a pre-application upload without any AI call and still keeps the text for evidence", async () => {
    const { uploadId } = await upload();
    await finishHostedResumeParse(uploadId);
    const row = await prisma.hostedApplyResumeUpload.findUniqueOrThrow({ where: { id: uploadId } });
    expect(calls).toHaveLength(0);
    expect(row.parseStatus).toBe("READY");
    expect(row.extractedText).toContain("Harbor Logistics");
    expect(row.fieldsNeedReview).toBe(false);
    expect(row.fieldSuggestion).toBeNull();
    expect(await prisma.aIRun.count({ where: { companyId } })).toBe(0);
  });

  it("refuses page-image AI for a hosted upload, which has no application or candidate yet", async () => {
    const audit: ResumeVisionAudit = {
      companyId,
      entityType: "HostedApplyResumeUpload",
      entityId: 1,
      pageCount: 1,
      pageIndex: 0,
      db: prisma as unknown as ResumeVisionAudit["db"],
    };
    expect(await transcribeResumePage(new Uint8Array([1, 2, 3]), audit)).toBeNull();
    expect(await transcribeResumePage(new Uint8Array([1, 2, 3]), null)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("records human review only, and no AI runs on submit or on reprocessing", async () => {
    const { claim, uploadId } = await upload();
    await finishHostedResumeParse(uploadId);
    const application = await apply("human", "human_only", claim);
    expect(application.aiEvaluationOptOut).toBe(true);
    expect(application.aiOptOutAt).not.toBeNull();
    expect((await prisma.application.findUniqueOrThrow({ where: { id: application.id } })).aiPreference).toBe("REFUSED");
    const document = await reprocess(application.id);
    expect(document.parseStatus).toBe("READY");
    expect(calls).toHaveLength(0);
    expect(await prisma.aIRun.count({ where: { companyId } })).toBe(0);
  });

  it("treats a missing or unknown choice as human review only", async () => {
    const first = await upload();
    const missing = await apply("missing", undefined, first.claim);
    expect(missing.aiEvaluationOptOut).toBe(true);
    const second = await upload();
    const garbled = await apply("garbled", "maybe", second.claim);
    expect(garbled.aiEvaluationOptOut).toBe(true);
    const states = await prisma.application.findMany({ where: { id: { in: [missing.id, garbled.id] } }, select: { aiPreference: true, aiPreferenceSource: true } });
    expect(states.map((row) => row.aiPreference)).toEqual(["UNKNOWN", "UNKNOWN"]);
    expect(states[0]?.aiPreferenceSource).toBe("HOSTED_FORM_NO_ANSWER");
    expect(calls).toHaveLength(0);
  });

  it("runs the field model only after an explicit yes, so the guard is not vacuous", async () => {
    const { claim } = await upload();
    const application = await apply("explicit-yes", "allowed", claim);
    expect(application.aiEvaluationOptOut).toBe(false);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: application.id } })).aiPreference).toBe("ALLOWED");
    await reprocess(application.id);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("blocks a recruiter upload with no application when the candidate opted out on another application", async () => {
    const { claim } = await upload();
    const optedOut = await apply("elsewhere", "human_only", claim);
    const key = buildResumeStorageKey(companyId, optedOut.candidateId, "txt");
    const stored = await storeResume(key, Buffer.from(RESUME));
    const document = await prisma.candidateResumeDocument.create({
      data: {
        companyId,
        candidateId: optedOut.candidateId,
        storageKey: key,
        fileName: "recruiter.txt",
        contentType: "text/plain",
        sizeBytes: stored.sizeBytes,
        contentSha256: stored.contentSha256,
        parseStatus: ResumeParseStatus.PARSING,
      },
    });
    calls = [];
    await finishCandidateResumeParse(document.id);
    expect(calls).toHaveLength(0);
  });

  it("opting out through the portal fails in-flight runs and stops reprocessing", async () => {
    const first = await upload();
    const allowed = await apply("Pref Flip", "allowed", first.claim);
    expect(allowed.aiEvaluationOptOut).toBe(false);
    const evidence = await prisma.candidateEvidence.create({
      data: { companyId, candidateId: allowed.candidateId, applicationId: allowed.id, sourceType: "RESUME_DOCUMENT", origin: "CANDIDATE_PROVIDED", inlineText: RESUME },
    });
    const running = await prisma.candidateIntelligenceRun.create({
      data: { companyId, candidateId: allowed.candidateId, evidenceId: evidence.id, status: "RUNNING", extractorType: "DETERMINISTIC_TEXT_V1", extractorVersion: "v1", modelProvider: "none", modelName: "none", promptVersion: "none" },
    });
    const email = `${MARKER}-Pref Flip@hireiq.test`.toLowerCase();
    expect(await setOptOut(allowed.id, email, true)).not.toBeNull();
    const stopped = await prisma.candidateIntelligenceRun.findUniqueOrThrow({ where: { id: running.id } });
    expect(stopped.status).toBe("FAILED");
    expect(stopped.errorCode).toBe("AI_EVALUATION_OPT_OUT");
    calls = [];
    await reprocess(allowed.id);
    expect(calls).toHaveLength(0);
  });

  it("re-reads the preference before each written answer, so an opt-out during grading stops the remaining model calls", async () => {
    const application = await apply("Mid Grade", "allowed", (await upload()).claim);
    const items = Array.from({ length: 6 }, (_, index) => ({
      id: `mg-${index + 1}`, type: "short_answer", prompt: "Explain one tradeoff you owned.", requirement: "Communication", rubricCriterion: "Communication",
    }));
    const assessment = await prisma.generatedAssessment.create({
      data: { jobId, companyId, version: 1, status: "PUBLISHED", items },
    });
    const token = `mid-grade-${MARKER}`;
    await prisma.generatedAssessmentInvite.create({
      data: {
        applicationId: application.id,
        assessmentId: assessment.id,
        tokenHash: hashSecureToken(token),
        itemOrder: items.map((item) => item.id),
        answers: Object.fromEntries(items.map((item) => [item.id, `Answer for ${item.id} about a real tradeoff.`])),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    calls = [];
    setGatewayFetchForTests(async (url) => {
      calls.push(String(url));
      await prisma.application.update({ where: { id: application.id }, data: { aiEvaluationOptOut: true, aiOptOutAt: new Date() } });
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
    });
    await submitGeneratedAssessment(token, null);
    const invite = await prisma.generatedAssessmentInvite.findFirstOrThrow({ where: { applicationId: application.id } });
    const grades = invite.grades as Array<{ reason?: string; needsHuman?: boolean }>;
    expect(calls).toHaveLength(1);
    expect(grades.slice(1).every((grade) => grade.needsHuman && grade.reason === "human-only")).toBe(true);
    await prisma.generatedAssessmentInvite.deleteMany({ where: { assessmentId: assessment.id } });
    await prisma.generatedAssessment.delete({ where: { id: assessment.id } });
  });
});

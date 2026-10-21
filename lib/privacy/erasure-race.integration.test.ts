import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CandidateStatus, JobStatus, PortalRole } from "@prisma/client";
import { setGatewayFetchForTests } from "@/lib/ai/gateway";
import { generateAssessmentFromRubric } from "@/lib/assessments/generated-assessment";
import { submitGeneratedAssessment } from "@/lib/assessments/generated-assessment-service";
import { hashSecureToken } from "@/lib/auth/secure-token";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { executeGenerateCandidateIntelligence } from "@/lib/candidates/intelligence/intelligence-service";
import { setCandidateIntelligenceGeneratorForTests } from "@/lib/candidates/intelligence/intelligence-extractor";
import { prisma } from "@/lib/prisma";
import { eraseCandidate, type ErasureDeps } from "@/lib/privacy/candidate-erasure";
import { withCandidateWriteGuard } from "@/lib/privacy/erasure-guard";
import { createEvidence } from "@/lib/repositories/candidate-evidence-repository";
import { loadOrCreateRetrievalEmbeddings } from "@/lib/retrieval/semantic-embedding-store";
import { finishCandidateResumeParse } from "@/lib/resumes/resume-parse-job";
import { processPendingResumeOcr } from "@/lib/resumes/ocr-queue";
import { buildResumeStorageKey, deleteResume, storeResume } from "@/lib/resumes/storage";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const hooks = vi.hoisted(() => ({
  extractGate: null as null | (() => Promise<void>),
  embedGate: null as null | (() => Promise<void>),
}));

vi.mock("@/lib/resumes/text-extraction", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/resumes/text-extraction")>();
  return {
    ...original,
    extractResumeText: async (...args: Parameters<typeof original.extractResumeText>) => {
      if (hooks.extractGate && String(args[1]?.fileName).startsWith("RACE-")) await hooks.extractGate();
      return original.extractResumeText(...args);
    },
  };
});

vi.mock("@/lib/retrieval/semantic-embedder", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/retrieval/semantic-embedder")>();
  return {
    ...original,
    embedRetrievalTexts: async (texts: string[]) => {
      if (hooks.embedGate) await hooks.embedGate();
      return { provider: "p", model: "m", modelVersion: "1", dimensions: 2, vectors: texts.map(() => [0.5, 0.5]) };
    },
  };
});

const MARKER = `race-${process.pid}-${Date.now()}`;
const SECRET = `${MARKER}-secret`;

/** A pause point: `entered` resolves when a worker reaches it, `release` lets it continue. */
function pause() {
  let release!: () => void;
  let entered!: () => void;
  const enteredPromise = new Promise<void>((resolve) => (entered = resolve));
  const releasePromise = new Promise<void>((resolve) => (release = resolve));
  return { wait: async () => { entered(); await releasePromise; }, entered: enteredPromise, release };
}

async function stillRunning(promise: Promise<unknown>, ms = 400) {
  const marker = Symbol("running");
  return (await Promise.race([promise.then(() => "done", () => "done"), new Promise((resolve) => setTimeout(() => resolve(marker), ms))])) === marker;
}

describe.skipIf(integrationDatabase.mode === "skip")("erasure racing in-flight work", () => {
  let companyId = 0;
  let adminId = 0;
  let jobId = 0;
  let assessmentId = 0;
  const storageKeys: string[] = [];
  const raw = { resend: process.env.RESEND_API_KEY, openai: process.env.OPENAI_API_KEY };
  const ok: ErasureDeps = { deleteObject: async () => ({ status: "ABSENT" }) };

  async function candidate(label: string) {
    const person = await prisma.candidate.create({ data: { name: `${label} ${SECRET}`, role: "Eng", experienceYears: 1, status: CandidateStatus.APPLIED, companyId } });
    const application = await prisma.application.create({ data: { candidateId: person.id, jobId, companyId, aiPreference: "ALLOWED" } });
    const evidence = await prisma.candidateEvidence.create({
      data: { companyId, candidateId: person.id, applicationId: application.id, sourceType: "RESUME_DOCUMENT", origin: "CANDIDATE_PROVIDED", inlineText: SECRET },
    });
    return { candidateId: person.id, applicationId: application.id, evidenceId: evidence.id };
  }

  async function resumeDoc(c: { candidateId: number; applicationId: number }, data: { parseStatus: "PARSING" | "FAILED"; parseErrorCode?: string }) {
    const key = buildResumeStorageKey(companyId, c.candidateId, "txt");
    storageKeys.push(key);
    const stored = await storeResume(key, Buffer.from(`Jane Doe resume ${SECRET}. Senior engineer with ten years of experience building services.`));
    return prisma.candidateResumeDocument.create({
      data: { companyId, candidateId: c.candidateId, applicationId: c.applicationId, storageKey: key, fileName: `RACE-${MARKER}.txt`, contentType: "text/plain", sizeBytes: stored.sizeBytes, contentSha256: stored.contentSha256, ...data },
    });
  }

  beforeAll(async () => {
    delete process.env.OPENAI_API_KEY;
    const company = await prisma.company.create({ data: { name: MARKER, industry: "T", employees: 2, publicSlug: MARKER } });
    companyId = company.id;
    adminId = (await prisma.user.create({ data: { email: `${MARKER}@hireiq.test`, name: "a", role: PortalRole.ADMIN, passwordHash: "x", emailVerifiedAt: new Date(), companyId } })).id;
    jobId = (await prisma.job.create({ data: { title: MARKER, status: JobStatus.OPEN, companyId } })).id;
    const items = generateAssessmentFromRubric({ requirements: ["SQL", "APIs", "Testing", "Debugging"], rubric: [] });
    assessmentId = (await prisma.generatedAssessment.create({ data: { jobId, companyId, version: 1, status: "PUBLISHED", publishedAt: new Date(), items } })).id;
  });

  afterAll(async () => {
    hooks.extractGate = null;
    hooks.embedGate = null;
    setGatewayFetchForTests(null);
    setCandidateIntelligenceGeneratorForTests(null);
    process.env.OPENAI_API_KEY = raw.openai;
    const where = { companyId };
    await deleteAuditLogsForTests(where);
    await prisma.candidateErasure.deleteMany({ where });
    await prisma.generatedAssessmentInvite.deleteMany({ where: { assessment: where } });
    await prisma.generatedAssessment.deleteMany({ where });
    await prisma.candidateClaim.deleteMany({ where });
    await prisma.candidateIntelligenceRun.deleteMany({ where });
    await prisma.retrievalEmbedding.deleteMany({ where });
    await prisma.candidateEvidence.deleteMany({ where });
    await prisma.candidateResumeDocument.deleteMany({ where });
    await prisma.applicationIngestionEvent.deleteMany({ where });
    await prisma.aIRun.deleteMany({ where });
    await prisma.application.deleteMany({ where });
    await prisma.candidate.deleteMany({ where });
    await prisma.job.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    for (const key of storageKeys) await deleteResume(key);
  });

  it("a write that already holds the candidate lock finishes first and is then erased; a write after erasure is refused", async () => {
    const c = await candidate("lock");
    const inside = pause();
    const writer = withCandidateWriteGuard(c.candidateId, companyId, async (tx) => {
      await createEvidence(
        { companyId, candidateId: c.candidateId, applicationId: c.applicationId, sourceType: "RESUME_DOCUMENT", origin: "RECRUITER_ENTERED", ingestionEventId: null, hostedApplySubmissionId: null, actorUserId: null, inlineText: `${SECRET}-late`, contentSha256: null },
        tx,
      );
      await inside.wait();
    });
    await inside.entered;
    const erasure = eraseCandidate({ companyId, candidateId: c.candidateId, trigger: "ADMIN_REQUEST", deps: ok });
    // Erasure cannot tombstone while the writer holds the lock.
    expect(await stillRunning(erasure)).toBe(true);
    expect((await prisma.candidate.findUniqueOrThrow({ where: { id: c.candidateId } })).erasedAt).toBeNull();
    inside.release();
    expect((await writer).ok).toBe(true);
    expect((await erasure).status).toBe("COMPLETED");
    // The late write committed before the tombstone, and the erasure steps ran after it, so nothing is left.
    const texts = await prisma.candidateEvidence.findMany({ where: { candidateId: c.candidateId }, select: { inlineText: true } });
    expect(texts.length).toBe(2);
    expect(texts.every((row) => row.inlineText === null)).toBe(true);
    const after = await withCandidateWriteGuard(c.candidateId, companyId, async () => "wrote");
    expect(after.ok).toBe(false);
  });

  it("resume parse paused before saving: the result is dropped after erasure", async () => {
    const c = await candidate("parse");
    const doc = await resumeDoc(c, { parseStatus: "PARSING" });
    const extracting = pause();
    hooks.extractGate = () => extracting.wait();
    const parse = finishCandidateResumeParse(doc.id);
    await extracting.entered;
    await eraseCandidate({ companyId, candidateId: c.candidateId, trigger: "ADMIN_REQUEST", deps: ok });
    hooks.extractGate = null;
    extracting.release();
    await parse;
    const row = await prisma.candidateResumeDocument.findUniqueOrThrow({ where: { id: doc.id } });
    expect(row).toMatchObject({ extractedText: null, fieldSuggestion: null, parseStatus: "FAILED", parseErrorCode: "ERASED" });
    expect(await prisma.candidateEvidence.count({ where: { candidateId: c.candidateId, inlineText: { not: null } } })).toBe(0);
  });

  it("OCR paused before saving: the late result does not restore text", async () => {
    const c = await candidate("ocr");
    const doc = await resumeDoc(c, { parseStatus: "FAILED", parseErrorCode: "OCR_DEFERRED" });
    const reading = pause();
    hooks.extractGate = () => reading.wait();
    const drain = processPendingResumeOcr(1);
    await reading.entered;
    expect((await prisma.candidateResumeDocument.findUniqueOrThrow({ where: { id: doc.id } })).parseErrorCode).toBe("OCR_CLAIMED");
    await eraseCandidate({ companyId, candidateId: c.candidateId, trigger: "ADMIN_REQUEST", deps: ok });
    hooks.extractGate = null;
    reading.release();
    await drain;
    expect(await prisma.candidateResumeDocument.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ extractedText: null, parseStatus: "FAILED", parseErrorCode: "ERASED" });
  });

  it("intelligence paused in the model call: no run result or claims are saved after erasure", async () => {
    const c = await candidate("intel");
    const calling = pause();
    setCandidateIntelligenceGeneratorForTests(async () => {
      await calling.wait();
      return { claims: [{ claimType: "EMPLOYER", value: SECRET, sourceSpanStart: 0, sourceSpanEnd: 5 }] };
    });
    const run = executeGenerateCandidateIntelligence({ candidateId: c.candidateId, evidenceId: c.evidenceId });
    const outcome = run.then(() => "completed", () => "refused");
    await calling.entered;
    await eraseCandidate({ companyId, candidateId: c.candidateId, trigger: "ADMIN_REQUEST", deps: ok });
    calling.release();
    expect(await outcome).toBe("refused");
    expect(await prisma.candidateClaim.count({ where: { candidateId: c.candidateId, value: { contains: SECRET } } })).toBe(0);
    expect(await prisma.candidateIntelligenceRun.count({ where: { candidateId: c.candidateId, status: "COMPLETED" } })).toBe(0);
  });

  it("intelligence whose result is ready while erasure holds the tombstone is refused at the final write", async () => {
    const c = await candidate("intel-final");
    setCandidateIntelligenceGeneratorForTests(async () => ({ claims: [{ claimType: "EMPLOYER", value: SECRET, sourceSpanStart: 0, sourceSpanEnd: 5 }] }));
    // Tombstone only, as if erasure were mid-run: the guard must refuse on the flag alone.
    await prisma.candidate.update({ where: { id: c.candidateId }, data: { erasedAt: new Date() } });
    await expect(executeGenerateCandidateIntelligence({ candidateId: c.candidateId, evidenceId: c.evidenceId })).rejects.toBeTruthy();
    expect(await prisma.candidateClaim.count({ where: { candidateId: c.candidateId } })).toBe(0);
  });

  it("assessment grading paused in the model call: grades and AI output are not written after erasure", async () => {
    const c = await candidate("grade");
    const items = generateAssessmentFromRubric({ requirements: ["SQL", "APIs", "Testing", "Debugging"], rubric: [] });
    const written = items.filter((item) => item.type === "short_answer" || item.type === "scenario");
    expect(written.length).toBeGreaterThan(0);
    const rawToken = `${MARKER}-grade-token`;
    const invite = await prisma.generatedAssessmentInvite.create({
      data: {
        applicationId: c.applicationId, assessmentId, tokenHash: hashSecureToken(rawToken), itemOrder: items.map((item) => item.id),
        answers: Object.fromEntries(written.map((item) => [item.id, `${SECRET} detailed answer about ${item.requirement}`])),
        startedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    process.env.OPENAI_API_KEY = "test-key";
    const calling = pause();
    let modelCalls = 0;
    setGatewayFetchForTests(async () => {
      modelCalls += 1;
      if (modelCalls === 1) await calling.wait();
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ score: 3, quote: SECRET, reason: "ok" }) } }], usage: {} }), { status: 200 });
    });
    const submit = submitGeneratedAssessment(rawToken, null).catch(() => "ended");
    await calling.entered;
    await eraseCandidate({ companyId, candidateId: c.candidateId, trigger: "ADMIN_REQUEST", deps: ok });
    calling.release();
    await submit;
    delete process.env.OPENAI_API_KEY;
    const row = await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: invite.id } });
    expect(row.answers).toEqual({});
    expect(row.grades).toBeNull();
    expect(row.gradedAt).toBeNull();
    expect(JSON.stringify(await prisma.aIRun.findMany({ where: { companyId, entityType: "GeneratedAssessmentInvite", entityId: invite.id } }))).not.toContain(SECRET);
    expect(await prisma.aIRun.count({ where: { companyId, entityType: "GeneratedAssessmentInvite", entityId: invite.id } })).toBe(0);
  });

  it("embedding paused in the provider call: the vector is not stored after erasure, and another candidate's is", async () => {
    const gone = await candidate("embed-gone");
    const keep = await candidate("embed-keep");
    const embedding = pause();
    hooks.embedGate = () => embedding.wait();
    const identity = { companyId, modelProvider: "p", modelName: "m", modelVersion: "1", dimensions: 2, normalizationVersion: "n" };
    const requests = [gone, keep].map((row) => ({ sourceType: "EVIDENCE" as const, sourceId: row.evidenceId, contentHash: `h-${row.evidenceId}`, text: "synthetic text" }));
    const load = loadOrCreateRetrievalEmbeddings({ identity, requests });
    await embedding.entered;
    await eraseCandidate({ companyId, candidateId: gone.candidateId, trigger: "ADMIN_REQUEST", deps: ok });
    hooks.embedGate = null;
    embedding.release();
    await load;
    expect(await prisma.retrievalEmbedding.count({ where: { companyId, sourceId: gone.evidenceId } })).toBe(0);
    expect(await prisma.retrievalEmbedding.count({ where: { companyId, sourceId: keep.evidenceId } })).toBe(1);
  });
});

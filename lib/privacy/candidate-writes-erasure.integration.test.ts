import "@/lib/evidence-graph/evidence-graph-test-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CandidateStatus, CodingTestStatus, JobStatus, PortalRole } from "@prisma/client";
import { submitHostedApply } from "@/lib/apply/hosted-apply-service";
import { storePendingHostedResume } from "@/lib/apply/hosted-resume-service";
import { generateAssessmentFromRubric } from "@/lib/assessments/generated-assessment";
import { saveAssessmentProgress, submitGeneratedAssessment } from "@/lib/assessments/generated-assessment-service";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { generateSecureToken, hashSecureToken } from "@/lib/auth/secure-token";
import { prisma } from "@/lib/prisma";
import { eraseCandidate, type ErasureDeps } from "@/lib/privacy/candidate-erasure";
import { createAiRunUnlessErased } from "@/lib/privacy/erasure-guard";
import { createHybridRetrievalResults } from "@/lib/repositories/hybrid-retrieval-repository";
import { createLexicalRetrievalResults } from "@/lib/repositories/lexical-retrieval-repository";
import { createSemanticRetrievalResults } from "@/lib/repositories/semantic-retrieval-repository";
import { finishHostedResumeParse } from "@/lib/resumes/resume-parse-job";
import { deleteResume } from "@/lib/resumes/storage";
import { submitPractical } from "@/lib/screening/practical-service";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const hooks = vi.hoisted(() => ({ extractGate: null as null | (() => Promise<void>) }));

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

const MARKER = `cw-${process.pid}-${Date.now()}`;
const SECRET = `${MARKER}-secret`;
const ok: ErasureDeps = { deleteObject: async () => ({ status: "ABSENT" }) };
const RESUME = `Pat Quinn\nBackend engineer at Harbor Logistics. ${SECRET}\nBuilt streaming importers in TypeScript with retries.\nSkills: TypeScript, PostgreSQL, Node.js, testing`;
const saved = { openai: process.env.OPENAI_API_KEY, skip: process.env.HIREIQ_SKIP_RESUME_PARSE };

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

describe.skipIf(integrationDatabase.mode === "skip")("candidate-originated writes and erasure", () => {
  let companyId = 0;
  let adminId = 0;
  let jobId = 0;
  let assessmentId = 0;
  let applyToken = "";
  let jobSpecId = 0;
  let writableItemId = "";
  const storageKeys: string[] = [];

  async function candidate(label: string) {
    const person = await prisma.candidate.create({ data: { name: `${label} ${SECRET}`, role: "Eng", experienceYears: 1, status: CandidateStatus.APPLIED, companyId } });
    const application = await prisma.application.create({ data: { candidateId: person.id, jobId, companyId, aiPreference: "ALLOWED" } });
    return { candidateId: person.id, applicationId: application.id };
  }

  async function invite(applicationId: number) {
    const token = `${MARKER}-inv-${randomUUID()}`;
    const row = await prisma.generatedAssessmentInvite.create({
      data: {
        applicationId,
        assessmentId,
        tokenHash: hashSecureToken(token),
        itemOrder: itemIds,
        answers: {},
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    return { token, id: row.id };
  }
  let itemIds: string[] = [];

  async function practical(applicationId: number) {
    const token = `${MARKER}-prac-${randomUUID()}`;
    const row = await prisma.codingTest.create({
      data: {
        title: "Practical", score: 0, maxScore: 10, status: CodingTestStatus.PENDING, takenAt: new Date(), applicationId,
        instructions: "Do it", assignedAt: new Date(), dueAt: new Date(Date.now() + 86_400_000), inviteTokenHash: hashSecureToken(token),
      },
    });
    return { token, id: row.id };
  }

  /**
   * Holds the candidate row exclusively with the tombstone written but not committed, like an erasure that has
   * started. Anything that needs the lock waits until `release`, then sees an erased candidate.
   */
  async function startTombstone(candidateId: number) {
    const gate = pause();
    const tx = prisma.$transaction(
      async (client) => {
        await client.$executeRaw`UPDATE "Candidate" SET "erasedAt" = now() WHERE id = ${candidateId}`;
        await gate.wait();
      },
      { timeout: 30_000 },
    );
    await gate.entered;
    return { release: async () => { gate.release(); await tx; } };
  }

  const erase = (candidateId: number) => eraseCandidate({ companyId, candidateId, trigger: "ADMIN_REQUEST", deps: ok });

  beforeAll(async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.HIREIQ_SKIP_RESUME_PARSE = "1";
    const company = await prisma.company.create({ data: { name: MARKER, industry: "T", employees: 2, publicSlug: MARKER.toLowerCase() } });
    companyId = company.id;
    adminId = (await prisma.user.create({ data: { email: `${MARKER}@hireiq.test`, name: "a", role: PortalRole.ADMIN, passwordHash: "x", emailVerifiedAt: new Date(), companyId } })).id;
    const job = await prisma.job.create({ data: { title: MARKER, status: JobStatus.OPEN, companyId } });
    jobId = job.id;
    const spec = await prisma.jobSpecificationVersion.create({ data: { jobId, versionNumber: 1, status: "PUBLISHED", title: job.title } });
    jobSpecId = spec.id;
    await prisma.job.update({ where: { id: jobId }, data: { currentPublishedSpecificationVersionId: spec.id } });
    const distribution = await prisma.jobDistribution.create({
      data: { companyId, jobId, jobSpecificationVersionId: spec.id, provider: "MANUAL", applyMode: "HIREIQ_HOSTED", status: "PUBLISHED" },
    });
    const token = generateSecureToken();
    applyToken = token.rawToken;
    await prisma.applyToken.create({ data: { distributionId: distribution.id, tokenHash: token.tokenHash } });
    const items = generateAssessmentFromRubric({ requirements: ["SQL", "APIs", "Testing", "Debugging"], rubric: [] });
    assessmentId = (await prisma.generatedAssessment.create({ data: { jobId, companyId, version: 1, status: "PUBLISHED", publishedAt: new Date(), items } })).id;
    itemIds = (items as Array<{ id: string }>).map((item) => item.id);
    const written = (items as Array<{ id: string; type: string }>).find((item) => item.type === "short_answer" || item.type === "written");
    writableItemId = (written ?? (items as Array<{ id: string; type: string }>).find((item) => item.type !== "multiple_choice" && item.type !== "coding") ?? (items as Array<{ id: string }>)[0]!).id;
  });

  afterAll(async () => {
    hooks.extractGate = null;
    process.env.OPENAI_API_KEY = saved.openai;
    process.env.HIREIQ_SKIP_RESUME_PARSE = saved.skip;
    if (!companyId) return;
    const where = { companyId };
    await deleteAuditLogsForTests(where);
    const steps: Array<() => Promise<unknown>> = [
      () => prisma.hybridRetrievalResult.deleteMany({ where }),
      () => prisma.hybridRetrievalRun.deleteMany({ where }),
      () => prisma.lexicalRetrievalResult.deleteMany({ where }),
      () => prisma.semanticRetrievalResult.deleteMany({ where }),
      () => prisma.lexicalRetrievalRun.deleteMany({ where }),
      () => prisma.semanticRetrievalRun.deleteMany({ where }),
      () => prisma.jobIntelligenceRun.deleteMany({ where }),
      () => prisma.candidateErasure.deleteMany({ where }),
      () => prisma.outboundEmailAttempt.deleteMany({ where }),
      () => prisma.practicalCriterionScore.deleteMany({ where }),
      () => prisma.codingTest.deleteMany({ where: { application: where } }),
      () => prisma.generatedAssessmentInvite.deleteMany({ where: { assessment: where } }),
      () => prisma.generatedAssessment.deleteMany({ where }),
      () => prisma.assessmentInvite.deleteMany({ where: { application: where } }),
      () => prisma.requirementMatch.deleteMany({ where }),
      () => prisma.candidateClaim.deleteMany({ where }),
      () => prisma.candidateIntelligenceRun.deleteMany({ where }),
      () => prisma.retrievalEmbedding.deleteMany({ where }),
      () => prisma.candidateEvidence.deleteMany({ where }),
      () => prisma.candidateResumeDocument.deleteMany({ where }),
      () => prisma.hostedApplyResumeUpload.deleteMany({ where }),
      () => prisma.hostedApplyPhotoUpload.deleteMany({ where }),
      () => prisma.applicationIngestionEvent.deleteMany({ where }),
      () => prisma.hostedApplySubmission.deleteMany({ where }),
      () => prisma.aIRun.deleteMany({ where }),
      () => prisma.application.deleteMany({ where }),
      () => prisma.candidateProfile.deleteMany({ where: { candidate: where } }),
      () => prisma.candidate.deleteMany({ where }),
      () => prisma.applyToken.deleteMany({ where: { distribution: where } }),
      () => prisma.jobDistribution.deleteMany({ where }),
      () => prisma.job.updateMany({ where, data: { currentPublishedSpecificationVersionId: null } }),
      () => prisma.jobSpecificationVersion.deleteMany({ where: { job: where } }),
      () => prisma.job.deleteMany({ where }),
      () => prisma.user.deleteMany({ where: { id: adminId } }),
      () => prisma.company.deleteMany({ where: { id: companyId } }),
    ];
    for (let pass = 0; pass < 2; pass += 1) for (const step of steps) await step().catch(() => undefined);
    for (const key of storageKeys) await deleteResume(key).catch(() => undefined);
  });

  describe("assessment autosave and submit", () => {
    it("an autosave that committed before erasure is erased", async () => {
      const c = await candidate("save-before");
      const inv = await invite(c.applicationId);
      await saveAssessmentProgress(inv.token, { [writableItemId]: `answer ${SECRET}` });
      expect(JSON.stringify((await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: inv.id } })).answers)).toContain(SECRET);
      await erase(c.candidateId);
      expect(await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ answers: {} });
    });

    it("an autosave in flight when the tombstone commits is refused and nothing is stored", async () => {
      const c = await candidate("save-race");
      const inv = await invite(c.applicationId);
      const tombstone = await startTombstone(c.candidateId);
      const write = saveAssessmentProgress(inv.token, { [writableItemId]: `answer ${SECRET}` }).then(() => "saved", (error: { code?: string }) => error.code ?? "error");
      expect(await stillRunning(write)).toBe(true);
      await tombstone.release();
      expect(await write).toBe("UNAVAILABLE");
      await erase(c.candidateId);
      expect(await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ answers: {} });
    });

    it("a retry with the same link after erasure cannot bring the answers back", async () => {
      const c = await candidate("save-retry");
      const inv = await invite(c.applicationId);
      await erase(c.candidateId);
      await expect(saveAssessmentProgress(inv.token, { [writableItemId]: `answer ${SECRET}` })).rejects.toMatchObject({ code: "UNAVAILABLE" });
      expect(await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ answers: {} });
    });

    it("a submit in flight when the tombstone commits is refused and the invite is not marked submitted", async () => {
      const c = await candidate("submit-race");
      const inv = await invite(c.applicationId);
      const tombstone = await startTombstone(c.candidateId);
      const submit = submitGeneratedAssessment(inv.token, null).then(() => "submitted", (error: { code?: string }) => error.code ?? "error");
      expect(await stillRunning(submit)).toBe(true);
      await tombstone.release();
      expect(await submit).toBe("UNAVAILABLE");
      expect((await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: inv.id } })).submittedAt).toBeNull();
    });

    it("other candidates are unaffected: their autosave still works, and their answers survive an erasure", async () => {
      const gone = await candidate("other-gone");
      const stays = await candidate("other-stays");
      const goneInvite = await invite(gone.applicationId);
      const staysInvite = await invite(stays.applicationId);
      await saveAssessmentProgress(staysInvite.token, { [writableItemId]: `keep ${SECRET}` });
      await erase(gone.candidateId);
      await saveAssessmentProgress(staysInvite.token, { [writableItemId]: `keep more ${SECRET}` });
      expect(JSON.stringify((await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: staysInvite.id } })).answers)).toContain("keep more");
      expect(await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: goneInvite.id } })).toMatchObject({ answers: {} });
    });
  });

  describe("practical submission", () => {
    const body = { text: `my solution ${SECRET}` };

    it("a submission that committed before erasure is erased", async () => {
      const c = await candidate("prac-before");
      const test = await practical(c.applicationId);
      await submitPractical(test.token, body);
      expect((await prisma.codingTest.findUniqueOrThrow({ where: { id: test.id } })).submissionText).toContain(SECRET);
      await erase(c.candidateId);
      expect(await prisma.codingTest.findUniqueOrThrow({ where: { id: test.id } })).toMatchObject({ submissionText: null, submissionUrl: null, inviteTokenHash: null });
    });

    it("a submission in flight when the tombstone commits is refused and nothing is stored", async () => {
      const c = await candidate("prac-race");
      const test = await practical(c.applicationId);
      const tombstone = await startTombstone(c.candidateId);
      const write = submitPractical(test.token, body).then(() => "submitted", (error: { code?: string }) => error.code ?? "error");
      expect(await stillRunning(write)).toBe(true);
      await tombstone.release();
      expect(await write).toBe("UNAVAILABLE");
      await erase(c.candidateId);
      expect(await prisma.codingTest.findUniqueOrThrow({ where: { id: test.id } })).toMatchObject({ submissionText: null, submittedAt: null });
    });

    it("a retry after erasure cannot bring the submission back", async () => {
      const c = await candidate("prac-retry");
      const test = await practical(c.applicationId);
      await erase(c.candidateId);
      await expect(submitPractical(test.token, body)).rejects.toMatchObject({ code: "UNAVAILABLE" });
      expect(await prisma.codingTest.findUniqueOrThrow({ where: { id: test.id } })).toMatchObject({ submissionText: null, submittedAt: null });
    });

    it("another candidate's practical on the same job is untouched and still submittable", async () => {
      const gone = await candidate("prac-gone");
      const stays = await candidate("prac-stays");
      await practical(gone.applicationId);
      const other = await practical(stays.applicationId);
      await erase(gone.candidateId);
      await submitPractical(other.token, body);
      expect((await prisma.codingTest.findUniqueOrThrow({ where: { id: other.id } })).submissionText).toContain(SECRET);
    });
  });

  describe("hosted application", () => {
    async function upload(fileName = "resume.txt") {
      const stored = await storePendingHostedResume({ applyTokenRaw: applyToken, fileName, bytes: Buffer.from(RESUME) });
      const row = await prisma.hostedApplyResumeUpload.findFirstOrThrow({ where: { companyId }, orderBy: { id: "desc" }, select: { id: true, storageKey: true } });
      storageKeys.push(row.storageKey);
      return { claim: stored.resumeClaim, uploadId: row.id };
    }

    async function apply(label: string, options: { claim?: string; key?: string; email?: string } = {}) {
      const key = options.key ?? randomUUID();
      const email = options.email ?? `${MARKER}-${label}@hireiq.test`;
      const result = await submitHostedApply({
        token: applyToken,
        idempotencyKey: key,
        resumeClaim: options.claim,
        body: { name: label, email, consent: true, aiEvaluation: "allowed" },
      });
      return { key, email, result };
    }

    const applicationByName = (name: string) =>
      prisma.application.findFirstOrThrow({ where: { companyId, candidate: { name } }, select: { id: true, candidateId: true, statusTokenHash: true } });

    it("replaying a submission for an erased candidate returns nothing new: no status link, no assessment link", async () => {
      const first = await apply("Replay Person");
      const app = await applicationByName("Replay Person");
      expect(first.result).toMatchObject({ success: true });
      await erase(app.candidateId);
      const invitesBefore = await prisma.assessmentInvite.count({ where: { applicationId: app.id } });
      const replay = await apply("Replay Person", { key: first.key, email: first.email });
      expect(replay.result).toMatchObject({ success: true, assessmentUrl: null, statusToken: null });
      expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).statusTokenHash).toBeNull();
      expect(await prisma.assessmentInvite.count({ where: { applicationId: app.id } })).toBe(invitesBefore);
      expect((await prisma.candidate.findUniqueOrThrow({ where: { id: app.candidateId } })).name).toBe(`Erased Candidate #${app.candidateId}`);
    });

    it("a genuine new application with the same email is accepted as a new person-record and does not touch the erased one", async () => {
      const email = `${MARKER}-reapply@hireiq.test`;
      await apply("Reapply One", { email });
      const old = await applicationByName("Reapply One");
      await erase(old.candidateId);
      const again = await apply("Reapply Two", { email });
      expect(again.result).toMatchObject({ success: true });
      const fresh = await applicationByName("Reapply Two");
      expect(fresh.candidateId).not.toBe(old.candidateId);
      expect((await prisma.candidate.findUniqueOrThrow({ where: { id: fresh.candidateId } })).erasedAt).toBeNull();
      expect((await prisma.candidate.findUniqueOrThrow({ where: { id: old.candidateId } })).erasedAt).not.toBeNull();
      expect((await prisma.application.findUniqueOrThrow({ where: { id: old.id } })).statusTokenHash).toBeNull();
    });

    it("erasing one hosted applicant clears their upload and run output, and leaves another applicant's upload alone", async () => {
      const a = await upload();
      const b = await upload();
      await finishHostedResumeParse(a.uploadId);
      await finishHostedResumeParse(b.uploadId);
      await apply("Upload A", { claim: a.claim });
      await apply("Upload B", { claim: b.claim });
      const appA = await applicationByName("Upload A");
      const appB = await applicationByName("Upload B");
      for (const id of [a.uploadId, b.uploadId]) {
        await prisma.aIRun.create({
          data: { companyId, feature: "resume.vision", entityType: "HostedApplyResumeUpload", entityId: id, modelId: "m", promptVersion: "v", inputHash: "h", outputJson: { page: SECRET }, latencyMs: 1 },
        });
      }
      expect((await prisma.hostedApplyResumeUpload.findUniqueOrThrow({ where: { id: a.uploadId } })).extractedText).toContain(SECRET);

      await erase(appA.candidateId);

      expect(await prisma.hostedApplyResumeUpload.findUniqueOrThrow({ where: { id: a.uploadId } })).toMatchObject({ extractedText: null, fieldSuggestion: null, fileName: "erased", parseErrorCode: "ERASED" });
      expect((await prisma.aIRun.findFirstOrThrow({ where: { companyId, entityType: "HostedApplyResumeUpload", entityId: a.uploadId } })).outputJson).toEqual({});
      const kept = await prisma.hostedApplyResumeUpload.findUniqueOrThrow({ where: { id: b.uploadId } });
      expect(kept.extractedText).toContain(SECRET);
      expect((await prisma.aIRun.findFirstOrThrow({ where: { companyId, entityType: "HostedApplyResumeUpload", entityId: b.uploadId } })).outputJson).toEqual({ page: SECRET });
      expect((await prisma.candidate.findUniqueOrThrow({ where: { id: appB.candidateId } })).erasedAt).toBeNull();

      // A late vision run for the erased applicant's upload is refused. The other applicant's is accepted.
      const row = (entityId: number) => ({ companyId, feature: "resume.vision", entityType: "HostedApplyResumeUpload", entityId, modelId: "m", promptVersion: "v", inputHash: "h", outputJson: { page: SECRET }, latencyMs: 1 });
      expect(await createAiRunUnlessErased(prisma, row(a.uploadId))).toBe(false);
      expect(await createAiRunUnlessErased(prisma, row(b.uploadId))).toBe(true);
      expect(await prisma.aIRun.count({ where: { companyId, entityType: "HostedApplyResumeUpload", entityId: a.uploadId } })).toBe(1);
    });

    it("a parse job that was paused before saving cannot bring the upload text back after erasure", async () => {
      const a = await upload(`RACE-${MARKER}.txt`);
      await apply("Late Parse", { claim: a.claim });
      const app = await applicationByName("Late Parse");
      await prisma.hostedApplyResumeUpload.update({ where: { id: a.uploadId }, data: { parseStatus: "PARSING", extractedText: null } });
      const gate = pause();
      hooks.extractGate = gate.wait;
      const job = finishHostedResumeParse(a.uploadId);
      await gate.entered;
      hooks.extractGate = null;
      await erase(app.candidateId);
      gate.release();
      await job;
      expect(await prisma.hostedApplyResumeUpload.findUniqueOrThrow({ where: { id: a.uploadId } })).toMatchObject({ extractedText: null, parseErrorCode: "ERASED" });
      // A retry of the job does nothing, because the upload is no longer waiting to be parsed.
      await finishHostedResumeParse(a.uploadId);
      expect((await prisma.hostedApplyResumeUpload.findUniqueOrThrow({ where: { id: a.uploadId } })).extractedText).toBeNull();
    });
  });

  describe("AI-run entity types", () => {
    const run = (entityType: string, entityId: number, feature = "test.feature") =>
      prisma.aIRun.create({
        data: { companyId, feature, entityType, entityId, modelId: "m", promptVersion: "v", inputHash: "h", outputJson: { text: SECRET }, error: SECRET, reviewerReason: SECRET, latencyMs: 1 },
      });
    const rowFor = (entityType: string, entityId: number) => ({ companyId, feature: "late.feature", entityType, entityId, modelId: "m", promptVersion: "v", inputHash: "h", outputJson: {}, latencyMs: 1 });

    async function entities(c: { candidateId: number; applicationId: number }) {
      const evidence = await prisma.candidateEvidence.create({
        data: { companyId, candidateId: c.candidateId, applicationId: c.applicationId, sourceType: "RESUME_DOCUMENT", origin: "CANDIDATE_PROVIDED", inlineText: SECRET },
      });
      const document = await prisma.candidateResumeDocument.create({
        data: { companyId, candidateId: c.candidateId, applicationId: c.applicationId, storageKey: `${MARKER}-${randomUUID()}`, fileName: "r.pdf", contentType: "application/pdf", sizeBytes: 1, contentSha256: "x", parseStatus: "READY", extractedText: SECRET },
      });
      const inv = await invite(c.applicationId);
      const test = await practical(c.applicationId);
      return [
        ["Candidate", c.candidateId],
        ["Application", c.applicationId],
        ["CandidateEvidence", evidence.id],
        ["CandidateResumeDocument", document.id],
        ["GeneratedAssessmentInvite", inv.id],
        ["CodingTest", test.id],
      ] as Array<[string, number]>;
    }

    it("clears every candidate-specific entity type for the erased candidate only, and keeps job-level and company-level runs", async () => {
      const gone = await candidate("ai-gone");
      const stays = await candidate("ai-stays");
      const goneEntities = await entities(gone);
      const staysEntities = await entities(stays);
      const goneRuns = await Promise.all(goneEntities.map(([type, id]) => run(type, id)));
      const staysRuns = await Promise.all(staysEntities.map(([type, id]) => run(type, id)));
      const shared = await Promise.all([run("Job", jobId, "copilot"), run("JobSpecificationVersion", jobSpecId, "job_description"), run("Company", companyId, "embeddings")]);

      await erase(gone.candidateId);

      for (const row of goneRuns) {
        const after = await prisma.aIRun.findUniqueOrThrow({ where: { id: row.id } });
        expect(after, `${after.entityType} output should be cleared`).toMatchObject({ outputJson: {}, error: null, reviewerReason: null });
        expect(after.feature).toBe("test.feature");
      }
      for (const row of [...staysRuns, ...shared]) {
        expect(await prisma.aIRun.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ outputJson: { text: SECRET }, error: SECRET });
      }
    });

    it("a stale worker cannot write a run for any candidate-specific entity of an erased candidate, but can for a live one", async () => {
      const gone = await candidate("late-gone");
      const stays = await candidate("late-stays");
      const goneEntities = await entities(gone);
      const staysEntities = await entities(stays);
      await erase(gone.candidateId);
      for (const [type, id] of goneEntities) {
        expect(await createAiRunUnlessErased(prisma, rowFor(type, id)), `${type} for the erased candidate`).toBe(false);
        expect(await prisma.aIRun.count({ where: { companyId, entityType: type, entityId: id } })).toBe(0);
      }
      for (const [type, id] of staysEntities) {
        expect(await createAiRunUnlessErased(prisma, rowFor(type, id)), `${type} for a live candidate`).toBe(true);
      }
    });
  });

  describe("retrieval snapshots", () => {
    async function runs() {
      const intelligence = await prisma.jobIntelligenceRun.create({
        data: { companyId, jobId, jobSpecificationVersionId: jobSpecId, status: "COMPLETED", extractorType: "DETERMINISTIC_SPEC_V1", extractorVersion: "v1", inputHash: `${MARKER}-${randomUUID()}` },
      });
      const common = { companyId, jobId, jobSpecificationVersionId: jobSpecId, jobIntelligenceRunId: intelligence.id, retrievalVersion: "v", queryConstructionVersion: "v", normalizationVersion: "v", ontologyVersion: "v", resultLimit: 10, queryHash: "q", evidenceSnapshotHash: randomUUID() };
      const lexical = await prisma.lexicalRetrievalRun.create({ data: { ...common, status: "COMPLETED" } });
      const semantic = await prisma.semanticRetrievalRun.create({
        data: { ...common, status: "COMPLETED", representationVersion: "v", embeddingProvider: "p", embeddingModel: "m", embeddingModelVersion: "1", embeddingDimensions: 2 },
      });
      const hybrid = await prisma.hybridRetrievalRun.create({
        data: { companyId, jobId, jobSpecificationVersionId: jobSpecId, lexicalRunId: lexical.id, semanticRunId: semantic.id, status: "COMPLETED", fusionVersion: "f", rrfK: 60, resultLimit: 10, datasetVersion: "d", lexicalRetrievalVersion: "v", semanticRetrievalVersion: "v" },
      });
      return { lexical, semantic, hybrid };
    }

    it("clears matched terms and the evidence link for the erased candidate, and keeps ranks, scores and other candidates", async () => {
      const gone = await candidate("snap-gone");
      const stays = await candidate("snap-stays");
      const evidence = await prisma.candidateEvidence.create({
        data: { companyId, candidateId: gone.candidateId, applicationId: gone.applicationId, sourceType: "RESUME_DOCUMENT", origin: "CANDIDATE_PROVIDED", inlineText: SECRET },
      });
      const { lexical, semantic, hybrid } = await runs();
      const rows = (extra: Record<string, unknown>) => [
        { applicationId: gone.applicationId, candidateId: gone.candidateId, ...extra },
        { applicationId: stays.applicationId, candidateId: stays.candidateId, ...extra },
      ];
      await createLexicalRetrievalResults({ companyId, runId: lexical.id, method: "m", rows: rows({ lexicalScore: 5, matchedTerms: [SECRET] }) as never });
      await createSemanticRetrievalResults({ companyId, runId: semantic.id, method: "m", rows: [
        { applicationId: gone.applicationId, candidateId: gone.candidateId, semanticScore: 0.9, supportingEvidenceId: evidence.id },
        { applicationId: stays.applicationId, candidateId: stays.candidateId, semanticScore: 0.8, supportingEvidenceId: null },
      ] as never });
      await createHybridRetrievalResults({ companyId, runId: hybrid.id, rows: rows({ rrfScore: 0.5, lexicalRank: 1, semanticRank: 1, fusionVersion: "f" }) as never });

      await erase(gone.candidateId);

      const lex = await prisma.lexicalRetrievalResult.findMany({ where: { runId: lexical.id }, orderBy: { rank: "asc" } });
      expect(lex).toHaveLength(2);
      expect(lex.find((row) => row.candidateId === gone.candidateId)).toMatchObject({ matchedTerms: [], lexicalScore: 5 });
      expect(lex.find((row) => row.candidateId === stays.candidateId)?.matchedTerms).toEqual([SECRET]);
      const sem = await prisma.semanticRetrievalResult.findMany({ where: { runId: semantic.id } });
      expect(sem.find((row) => row.candidateId === gone.candidateId)).toMatchObject({ supportingEvidenceId: null, semanticScore: 0.9 });
      expect(await prisma.hybridRetrievalResult.count({ where: { runId: hybrid.id } })).toBe(2);
    });

    it("a stale retrieval run cannot write snapshot rows for an erased candidate, and still writes the others", async () => {
      const gone = await candidate("stale-gone");
      const stays = await candidate("stale-stays");
      const { lexical, semantic, hybrid } = await runs();
      await erase(gone.candidateId);
      const pair = (extra: Record<string, unknown>) => [
        { applicationId: gone.applicationId, candidateId: gone.candidateId, ...extra },
        { applicationId: stays.applicationId, candidateId: stays.candidateId, ...extra },
      ];
      await createLexicalRetrievalResults({ companyId, runId: lexical.id, method: "m", rows: pair({ lexicalScore: 5, matchedTerms: [SECRET] }) as never });
      await createSemanticRetrievalResults({ companyId, runId: semantic.id, method: "m", rows: pair({ semanticScore: 0.5, supportingEvidenceId: null }) as never });
      await createHybridRetrievalResults({ companyId, runId: hybrid.id, rows: pair({ rrfScore: 0.5, lexicalRank: 1, semanticRank: 1, fusionVersion: "f" }) as never });
      for (const rows of [
        await prisma.lexicalRetrievalResult.findMany({ where: { runId: lexical.id } }),
        await prisma.semanticRetrievalResult.findMany({ where: { runId: semantic.id } }),
        await prisma.hybridRetrievalResult.findMany({ where: { runId: hybrid.id } }),
      ]) {
        expect(rows.map((row) => row.candidateId)).toEqual([stays.candidateId]);
        expect(rows[0]!.rank).toBe(1);
      }
    });
  });
});

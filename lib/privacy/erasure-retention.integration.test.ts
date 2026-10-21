import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ApplicationPipelineStatus, CandidateStatus, CodingTestStatus, JobStatus, PortalRole } from "@prisma/client";
import { aiBlockReasonForSubject } from "@/lib/ai/ai-policy";
import { completeStructured, setGatewayFetchForTests } from "@/lib/ai/gateway";
import { optedOutCandidateIds } from "@/lib/ai/opt-out";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { retryPendingOutboundEmails } from "@/lib/communication/email-transport";
import { prisma } from "@/lib/prisma";
import { eraseCandidate, retryIncompleteErasures, type ErasureDeps } from "@/lib/privacy/candidate-erasure";
import { completeDeletionRequest } from "@/lib/privacy/deletion-queue";
import { RetentionExecutionDisabledError, runRetention } from "@/lib/privacy/retention-worker";
import type { RetentionPolicyProvider, RetentionRules } from "@/lib/privacy/retention-policy";
import { listRetrievalEmbeddings } from "@/lib/repositories/semantic-retrieval-repository";
import { createEvidence } from "@/lib/repositories/candidate-evidence-repository";
import { buildResumeStorageKey, readResume, storeResume } from "@/lib/resumes/storage";
import { sendCandidateStageEmail } from "@/lib/screening/candidate-email";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `erase-${process.pid}-${Date.now()}`;
const SECRET = `${MARKER}-secret-text`;
const saved = { resend: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM, node: process.env.NODE_ENV };

let resendCalls = 0;
let modelCalls = 0;

type Tenant = { companyId: number; adminId: number; jobId: number; specId: number; assessmentId: number };
type Seeded = { candidateId: number; applicationId: number; email: string; storageKey: string; evidenceId: number; inviteId: number; testId: number; emailRowId: number };

describe.skipIf(integrationDatabase.mode === "skip")("erasure completeness and retention worker", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const candidateIds: number[] = [];
  const storageKeys: string[] = [];
  let a: Tenant;
  let b: Tenant;
  const failing: ErasureDeps = { deleteObject: async () => ({ status: "FAILED", code: "STORAGE_DELETE_FAILED" }) };
  const working: ErasureDeps = { deleteObject: async () => ({ status: "ABSENT" }) };

  async function tenant(label: string): Promise<Tenant> {
    const company = await prisma.company.create({ data: { name: `${MARKER} ${label}`, industry: "T", employees: 3, publicSlug: `${MARKER}-${label}` } });
    companyIds.push(company.id);
    const admin = await prisma.user.create({
      data: { email: `${MARKER}-${label}@hireiq.test`, name: `${label} admin`, role: PortalRole.ADMIN, passwordHash: "x", emailVerifiedAt: new Date(), companyId: company.id },
    });
    userIds.push(admin.id);
    const job = await prisma.job.create({ data: { title: `${MARKER} ${label}`, status: JobStatus.OPEN, companyId: company.id } });
    const spec = await prisma.jobSpecificationVersion.create({ data: { jobId: job.id, versionNumber: 1, status: "PUBLISHED", title: job.title } });
    const assessment = await prisma.generatedAssessment.create({ data: { jobId: job.id, companyId: company.id, version: 1, status: "PUBLISHED", items: [] } });
    return { companyId: company.id, adminId: admin.id, jobId: job.id, specId: spec.id, assessmentId: assessment.id };
  }

  async function seed(t: Tenant, label: string, status: ApplicationPipelineStatus = ApplicationPipelineStatus.REJECTED, ageDays = 400): Promise<Seeded> {
    const candidate = await prisma.candidate.create({
      data: { name: `${label} ${SECRET}`, role: "Eng", experienceYears: 2, status: CandidateStatus.APPLIED, companyId: t.companyId, location: SECRET, skills: SECRET },
    });
    candidateIds.push(candidate.id);
    const application = await prisma.application.create({
      data: { candidateId: candidate.id, jobId: t.jobId, companyId: t.companyId, status, aiPreference: "ALLOWED", rejectionReason: SECRET },
    });
    const email = `${label}-${MARKER}@candidate.test`.toLowerCase();
    await prisma.applicationIngestionEvent.create({
      data: {
        companyId: t.companyId, jobId: t.jobId, applicationId: application.id, candidateId: candidate.id, sourceChannel: "MANUAL",
        jobSpecificationVersionId: t.specId, status: "PROCESSED", applicantName: `${label} ${SECRET}`, applicantEmailNormalized: email, applicantPhone: SECRET,
      },
    });
    const evidence = await prisma.candidateEvidence.create({
      data: { companyId: t.companyId, candidateId: candidate.id, applicationId: application.id, sourceType: "RESUME_DOCUMENT", origin: "CANDIDATE_PROVIDED", inlineText: SECRET },
    });
    const run = await prisma.candidateIntelligenceRun.create({
      data: { companyId: t.companyId, candidateId: candidate.id, evidenceId: evidence.id, status: "COMPLETED", extractorType: "DETERMINISTIC_TEXT_V1", extractorVersion: "v1", modelProvider: "none", modelName: "none", promptVersion: "none" },
    });
    await prisma.candidateClaim.create({ data: { companyId: t.companyId, candidateId: candidate.id, runId: run.id, evidenceId: evidence.id, claimType: "EMPLOYER", value: SECRET, normalizedValue: SECRET } });
    await prisma.candidateClaim.create({ data: { companyId: t.companyId, candidateId: candidate.id, runId: run.id, evidenceId: evidence.id, claimType: "SKILL", value: "SQL", normalizedValue: "sql" } });
    const key = buildResumeStorageKey(t.companyId, candidate.id, "txt");
    storageKeys.push(key);
    const stored = await storeResume(key, Buffer.from(SECRET));
    await prisma.candidateResumeDocument.create({
      data: {
        companyId: t.companyId, candidateId: candidate.id, applicationId: application.id, storageKey: key, fileName: `${SECRET}.txt`, contentType: "text/plain",
        sizeBytes: stored.sizeBytes, contentSha256: stored.contentSha256, parseStatus: "READY", extractedText: SECRET, fieldSuggestion: { name: SECRET },
      },
    });
    await prisma.retrievalEmbedding.create({
      data: { companyId: t.companyId, sourceType: "EVIDENCE", sourceId: evidence.id, contentHash: `h-${evidence.id}`, modelProvider: "p", modelName: "m", modelVersion: "1", dimensions: 2, normalizationVersion: "n", vector: [0.1, 0.2] },
    });
    await prisma.aIRun.create({
      data: { companyId: t.companyId, feature: "evidence_review", entityType: "CandidateEvidence", entityId: evidence.id, modelId: "m", promptVersion: "p", inputHash: "abc", outputJson: { quote: SECRET }, latencyMs: 1, error: SECRET },
    });
    const invite = await prisma.generatedAssessmentInvite.create({
      data: {
        applicationId: application.id, assessmentId: t.assessmentId, tokenHash: `${MARKER}-${label}-token`, itemOrder: [], answers: { q1: SECRET }, integrity: { blur: 3, note: SECRET },
        expiresAt: new Date(Date.now() + 86_400_000), submittedAt: new Date(), gradedAt: new Date(), grades: [{ itemId: "q1", score: 4, max: 5, needsHuman: false, quote: SECRET, reason: "x" }],
      },
    });
    const test = await prisma.codingTest.create({
      data: { applicationId: application.id, title: "Importer", score: 0, maxScore: 20, status: CodingTestStatus.PENDING, takenAt: new Date(), assignedAt: new Date(), submittedAt: new Date(), submissionText: SECRET, submissionUrl: `https://x.test/${SECRET}`, inviteTokenHash: `${MARKER}-${label}-practical` },
    });
    await prisma.practicalCriterionScore.create({
      data: { companyId: t.companyId, codingTestId: test.id, criterionKey: "c1", points: 3, maxPoints: 5, source: "HUMAN", gradedByUserId: t.adminId, rationale: SECRET, evidenceQuote: SECRET },
    });
    await prisma.interviewBookingInvite.create({ data: { applicationId: application.id, tokenHash: `${MARKER}-${label}-book`, expiresAt: new Date(Date.now() + 86_400_000) } });
    const queued = await prisma.outboundEmailAttempt.create({
      data: { to: email, subject: `Hello ${SECRET}`, text: SECRET, html: `<p>${SECRET}</p>`, status: "FAILED", attempts: 1, nextRetryAt: new Date(Date.now() - 1000), companyId: t.companyId, candidateId: candidate.id },
    });
    await prisma.$executeRaw`UPDATE "Application" SET "updatedAt" = now() - make_interval(days => ${ageDays}::int) WHERE id = ${application.id}`;
    await prisma.$executeRaw`UPDATE "OutboundEmailAttempt" SET "createdAt" = now() - make_interval(days => ${ageDays}::int) WHERE id = ${queued.id}`;
    return { candidateId: candidate.id, applicationId: application.id, email, storageKey: key, evidenceId: evidence.id, inviteId: invite.id, testId: test.id, emailRowId: queued.id };
  }

  beforeAll(async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.EMAIL_FROM = "HireIQ <test@hireiq.test>";
    vi.stubGlobal("fetch", async (url: string | URL) => {
      if (!String(url).startsWith("https://api.resend.com/")) throw new Error(`Unexpected network call to ${String(url)}`);
      resendCalls += 1;
      return new Response("{}", { status: 200 });
    });
    setGatewayFetchForTests(async () => {
      modelCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }], usage: {} }), { status: 200 });
    });
    a = await tenant("a");
    b = await tenant("b");
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    setGatewayFetchForTests(null);
    process.env.RESEND_API_KEY = saved.resend;
    process.env.EMAIL_FROM = saved.from;
    (process.env as Record<string, string | undefined>).NODE_ENV = saved.node;
    const where = { companyId: { in: companyIds } };
    await deleteAuditLogsForTests(where);
    await prisma.retentionHold.deleteMany({ where });
    await prisma.candidateErasure.deleteMany({ where });
    await prisma.candidateDeletionRequest.deleteMany({ where });
    await prisma.practicalCriterionScore.deleteMany({ where });
    await prisma.codingTest.deleteMany({ where: { application: where } });
    await prisma.generatedAssessmentInvite.deleteMany({ where: { assessment: where } });
    await prisma.generatedAssessment.deleteMany({ where });
    await prisma.interviewBookingInvite.deleteMany({ where: { application: where } });
    await prisma.candidateClaim.deleteMany({ where });
    await prisma.candidateIntelligenceRun.deleteMany({ where });
    await prisma.retrievalEmbedding.deleteMany({ where });
    await prisma.candidateEvidence.deleteMany({ where });
    await prisma.candidateResumeDocument.deleteMany({ where });
    await prisma.applicationIngestionEvent.deleteMany({ where });
    await prisma.aIRun.deleteMany({ where });
    await prisma.outboundEmailAttempt.deleteMany({ where: { OR: [where, { to: { contains: MARKER } }] } });
    await prisma.application.deleteMany({ where });
    await prisma.candidate.deleteMany({ where });
    await prisma.jobSpecificationVersion.deleteMany({ where: { job: where } });
    await prisma.job.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    const { deleteResume } = await import("@/lib/resumes/storage");
    for (const key of storageKeys) await deleteResume(key);
  });

  it("erases every artifact for one candidate and leaves another tenant's candidate untouched", async () => {
    const mine = await seed(a, "mine");
    const other = await seed(b, "other");
    const unscoped = await prisma.outboundEmailAttempt.create({ data: { to: mine.email, subject: "legacy", text: SECRET, html: SECRET, status: "FAILED", attempts: 1 } });

    const result = await eraseCandidate({ companyId: a.companyId, candidateId: mine.candidateId, trigger: "ADMIN_REQUEST", requestedByUserId: a.adminId });
    expect(result).toMatchObject({ status: "COMPLETED", failedSteps: [], attempts: 1 });
    expect(result.legacyEmail).toEqual({ sanitized: 1, cancelledOnly: 0, leftAmbiguous: 0 });
    expect(result.storage).toEqual({ deleted: 1, absent: 0, failed: 0 });

    const candidate = await prisma.candidate.findUniqueOrThrow({ where: { id: mine.candidateId } });
    expect(candidate).toMatchObject({ name: `Erased Candidate #${mine.candidateId}`, location: null, skills: null });
    expect(candidate.erasedAt).not.toBeNull();
    const application = await prisma.application.findUniqueOrThrow({ where: { id: mine.applicationId } });
    expect(application).toMatchObject({ rejectionReason: null, status: "REJECTED", aiPreference: "REFUSED", aiPreferenceSource: "ERASED" });
    const event = await prisma.applicationIngestionEvent.findFirstOrThrow({ where: { applicationId: mine.applicationId } });
    expect(event).toMatchObject({ applicantName: "ERASED", applicantEmailNormalized: null, applicantPhone: null });
    expect((await prisma.candidateEvidence.findUniqueOrThrow({ where: { id: mine.evidenceId } })).inlineText).toBeNull();
    const claims = await prisma.candidateClaim.findMany({ where: { candidateId: mine.candidateId }, orderBy: { id: "asc" } });
    expect(claims.map((row) => row.value)).toEqual(["ERASED", "SQL"]);
    const doc = await prisma.candidateResumeDocument.findFirstOrThrow({ where: { candidateId: mine.candidateId } });
    expect(doc).toMatchObject({ extractedText: null, fieldSuggestion: null, fileName: "erased", parseStatus: "FAILED", parseErrorCode: "ERASED" });
    expect(await readResume(mine.storageKey)).toBeNull();
    expect(await prisma.retrievalEmbedding.count({ where: { companyId: a.companyId, sourceId: mine.evidenceId } })).toBe(0);
    const run = await prisma.aIRun.findFirstOrThrow({ where: { entityType: "CandidateEvidence", entityId: mine.evidenceId } });
    expect(run).toMatchObject({ outputJson: {}, error: null, inputHash: "abc", feature: "evidence_review" });
    const invite = await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: mine.inviteId } });
    expect(invite.answers).toEqual({});
    expect(invite.integrity).toBeNull();
    expect(invite.grades).toEqual([{ itemId: "q1", score: 4, max: 5, needsHuman: false, quote: null, overrideReason: null, reason: "x" }]);
    expect(invite.tokenHash).toBe(`erased:${mine.inviteId}`);
    expect(invite.expiresAt.getTime()).toBeLessThan(Date.now());
    const practical = await prisma.codingTest.findUniqueOrThrow({ where: { id: mine.testId } });
    expect(practical).toMatchObject({ submissionText: null, submissionUrl: null, inviteTokenHash: null, maxScore: 20 });
    expect(await prisma.practicalCriterionScore.findFirstOrThrow({ where: { codingTestId: mine.testId } })).toMatchObject({ rationale: null, evidenceQuote: null, points: 3 });
    expect(await prisma.interviewBookingInvite.count({ where: { applicationId: mine.applicationId } })).toBe(0);
    expect(await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: mine.emailRowId } })).toMatchObject({ status: "CANCELLED", to: "erased@erased.invalid", subject: "erased", text: "", html: "" });
    // An untagged row to an address no one else uses is about this person, so it is sanitised too.
    expect(await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: unscoped.id } })).toMatchObject({ text: "", status: "CANCELLED", to: "erased@erased.invalid" });

    // Other tenant is intact, including its queued email.
    expect((await prisma.candidate.findUniqueOrThrow({ where: { id: other.candidateId } })).erasedAt).toBeNull();
    expect((await prisma.candidateEvidence.findUniqueOrThrow({ where: { id: other.evidenceId } })).inlineText).toBe(SECRET);
    expect(await readResume(other.storageKey)).not.toBeNull();
    expect((await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: other.emailRowId } })).status).toBe("FAILED");

    // The ledger holds step names only.
    const ledger = await prisma.candidateErasure.findFirstOrThrow({ where: { candidateId: mine.candidateId } });
    expect(JSON.stringify(ledger)).not.toContain(SECRET);
  });

  it("is idempotent when run twice", async () => {
    const row = await seed(a, "twice");
    const first = await eraseCandidate({ companyId: a.companyId, candidateId: row.candidateId, trigger: "ADMIN_REQUEST" });
    const erasedAt = (await prisma.candidate.findUniqueOrThrow({ where: { id: row.candidateId } })).erasedAt;
    const completedAt = (await prisma.candidateErasure.findFirstOrThrow({ where: { candidateId: row.candidateId } })).completedAt;
    const second = await eraseCandidate({ companyId: a.companyId, candidateId: row.candidateId, trigger: "ADMIN_REQUEST" });
    expect(first.status).toBe("COMPLETED");
    expect(second).toMatchObject({ status: "COMPLETED", failedSteps: [], attempts: 2 });
    expect((await prisma.candidate.findUniqueOrThrow({ where: { id: row.candidateId } })).erasedAt).toEqual(erasedAt);
    expect((await prisma.candidateErasure.findFirstOrThrow({ where: { candidateId: row.candidateId } })).completedAt).toEqual(completedAt);
    expect(await prisma.candidateErasure.count({ where: { candidateId: row.candidateId } })).toBe(1);
  });

  it("refuses a candidate from another tenant", async () => {
    const row = await seed(b, "foreign");
    await expect(eraseCandidate({ companyId: a.companyId, candidateId: row.candidateId, trigger: "ADMIN_REQUEST" })).rejects.toMatchObject({ code: "CANDIDATE_NOT_FOUND" });
    expect((await prisma.candidate.findUniqueOrThrow({ where: { id: row.candidateId } })).erasedAt).toBeNull();
  });

  it("reports a partial failure, keeps content redacted, and the retry job finishes it", async () => {
    const row = await seed(a, "partial");
    const first = await eraseCandidate({ companyId: a.companyId, candidateId: row.candidateId, trigger: "ADMIN_REQUEST", deps: failing });
    expect(first.status).toBe("PARTIAL");
    expect(first.failedSteps).toEqual(["profile", "resume-documents"].filter((step) => first.failedSteps.includes(step)));
    expect(first.failedSteps).toContain("resume-documents");
    expect(first.completedSteps).toContain("queued-email");
    // Text is already gone even though the file delete failed, and the file key is kept for the retry.
    expect((await prisma.candidateResumeDocument.findFirstOrThrow({ where: { candidateId: row.candidateId } })).extractedText).toBeNull();
    expect(await readResume(row.storageKey)).not.toBeNull();
    expect(await prisma.candidateErasure.findFirstOrThrow({ where: { candidateId: row.candidateId } })).toMatchObject({ status: "PARTIAL", completedAt: null });

    const stillFailing = await retryIncompleteErasures({ deps: failing, companyIds: [a.companyId, b.companyId] });
    expect(stillFailing.stillPartial).toBeGreaterThanOrEqual(1);
    const retried = await retryIncompleteErasures({ deps: undefined, companyIds: [a.companyId, b.companyId] });
    expect(retried.completed).toBeGreaterThanOrEqual(1);
    expect(await prisma.candidateErasure.findFirstOrThrow({ where: { candidateId: row.candidateId } })).toMatchObject({ status: "COMPLETED", failedSteps: [] });
    expect(await readResume(row.storageKey)).toBeNull();
  });

  it("cancels queued work so nothing is sent and nothing can be recreated", async () => {
    const row = await seed(a, "pending", ApplicationPipelineStatus.CV_POOL);
    await eraseCandidate({ companyId: a.companyId, candidateId: row.candidateId, trigger: "ADMIN_REQUEST" });
    resendCalls = 0;
    await retryPendingOutboundEmails(1000, { companyId: { in: [a.companyId, b.companyId] } });
    expect(await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: row.emailRowId } })).toMatchObject({ status: "CANCELLED" });
    // The retry sweep may send other rows. It must never send this one.
    expect((await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: row.emailRowId } })).attempts).toBe(1);

    // No stage email: the address is gone.
    const before = resendCalls;
    // Erasure also unsubscribes the application and removes the address, so either outcome blocks the send.
    expect(["unsubscribed", "no-email"]).toContain(await sendCandidateStageEmail({ applicationId: row.applicationId, companyId: a.companyId, subject: () => "s", lines: () => ["x"] }));
    expect(resendCalls).toBe(before);

    // OCR queue: an erased document is not claimable.
    expect(await prisma.candidateResumeDocument.count({ where: { candidateId: row.candidateId, parseErrorCode: "OCR_DEFERRED" } })).toBe(0);
    // Evidence cannot be recreated.
    const again = await createEvidence({
      companyId: a.companyId, candidateId: row.candidateId, applicationId: row.applicationId, sourceType: "RESUME_DOCUMENT", origin: "CANDIDATE_PROVIDED",
      ingestionEventId: null, hostedApplySubmissionId: null, actorUserId: null, inlineText: SECRET, contentSha256: null,
    });
    expect(again).toBeNull();
    // AI is refused for every feature and the model is never called.
    expect(await aiBlockReasonForSubject({ applicationId: row.applicationId, companyId: a.companyId })).toBe("ERASED");
    modelCalls = 0;
    for (const feature of ["resume_fields", "evidence_review", "assessment_grade", "requirement_quotes"] as const) {
      await completeStructured({ feature, model: "m", promptVersion: "p", system: "s", user: "u", schemaName: "x", schema: { type: "object" }, apiKey: "k", maxRetries: 0, subject: { applicationId: row.applicationId, companyId: a.companyId } }).catch(() => undefined);
    }
    expect(modelCalls).toBe(0);
    // The assessment link no longer opens.
    const invite = await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: row.inviteId } });
    expect(invite.expiresAt.getTime()).toBeLessThan(Date.now());
  });

  it("drops erased candidates and their embeddings from retrieval", async () => {
    const keep = await seed(a, "retrieval-keep");
    const gone = await seed(a, "retrieval-gone");
    const lookup = { companyId: a.companyId, sourceType: "EVIDENCE" as const, sourceIds: [keep.evidenceId, gone.evidenceId], modelProvider: "p", modelName: "m", modelVersion: "1", normalizationVersion: "n" };
    expect((await listRetrievalEmbeddings(lookup)).length).toBe(2);
    expect((await optedOutCandidateIds(a.companyId, [keep.candidateId, gone.candidateId])).size).toBe(0);
    await eraseCandidate({ companyId: a.companyId, candidateId: gone.candidateId, trigger: "ADMIN_REQUEST" });
    expect((await listRetrievalEmbeddings(lookup)).map((row) => row.sourceId)).toEqual([keep.evidenceId]);
    const blocked = await optedOutCandidateIds(a.companyId, [keep.candidateId, gone.candidateId]);
    expect([...blocked]).toEqual([gone.candidateId]);
  });

  it("deletion queue completion erases, keeps minimal audit evidence, and stays queued on partial failure", async () => {
    const row = await seed(a, "queue");
    await prisma.auditLog.create({ data: { actorUserId: a.adminId, actorRole: "ADMIN", companyId: a.companyId, action: "APPLICATION_STAGE_CHANGED", targetType: "APPLICATION", targetId: row.applicationId, reason: "CV_POOL -> REJECTED" } });
    const request = await prisma.candidateDeletionRequest.create({ data: { companyId: a.companyId, candidateId: row.candidateId, applicationId: row.applicationId, emailNormalized: row.email } });
    await completeDeletionRequest({ requestId: request.id, actorUserId: a.adminId });
    expect(await prisma.candidateDeletionRequest.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({ status: "COMPLETED", emailNormalized: "erased" });
    const audits = await prisma.auditLog.findMany({ where: { companyId: a.companyId, targetType: { in: ["APPLICATION", "CANDIDATE"] }, targetId: { in: [row.applicationId, row.candidateId] } } });
    expect(audits.map((entry) => entry.action).sort()).toEqual(["APPLICATION_STAGE_CHANGED", "DELETION_COMPLETED"]);
    expect(JSON.stringify(audits)).not.toContain(SECRET);
    expect(JSON.stringify(audits)).not.toContain(row.email);

    const second = await seed(a, "queue-fail");
    const queued = await prisma.candidateDeletionRequest.create({ data: { companyId: a.companyId, candidateId: second.candidateId, emailNormalized: second.email } });
    await eraseCandidate({ companyId: a.companyId, candidateId: second.candidateId, trigger: "DELETION_QUEUE", deps: failing });
    // A partial ledger row exists; completing the request repeats the steps and succeeds with real storage.
    await completeDeletionRequest({ requestId: queued.id, actorUserId: a.adminId });
    expect((await prisma.candidateDeletionRequest.findUniqueOrThrow({ where: { id: queued.id } })).status).toBe("COMPLETED");
  });

  describe("retention worker", () => {
    function provider(rulesByCompany: Record<number, RetentionRules>): RetentionPolicyProvider {
      return { listCompanyIds: async () => Object.keys(rulesByCompany).map(Number), rulesFor: async (id) => rulesByCompany[id] ?? {} };
    }
    const closed = [ApplicationPipelineStatus.REJECTED];

    it("reports NO_POLICY and expires nothing without a configured rule, even when asked to execute", async () => {
      const row = await seed(a, "nopolicy");
      const report = await runRetention({ provider: provider({ [a.companyId]: {}, [b.companyId]: {} }), mode: "execute" });
      expect(report.totals).toMatchObject({ eligible: 0, expired: 0 });
      expect(report.companies.every((company) => company.categories.every((category) => category.policy === "NO_POLICY"))).toBe(true);
      expect(report.decisionRequired.length).toBeGreaterThan(0);
      expect((await prisma.candidate.findUniqueOrThrow({ where: { id: row.candidateId } })).erasedAt).toBeNull();
    });

    it("defaults to dry-run, which counts eligible, ineligible and held candidates without changing anything", async () => {
      const old = await seed(a, "ret-old", ApplicationPipelineStatus.REJECTED, 400);
      const recent = await seed(a, "ret-recent", ApplicationPipelineStatus.REJECTED, 5);
      const open = await seed(a, "ret-open", ApplicationPipelineStatus.TECH_EVALUATION, 400);
      const hired = await seed(a, "ret-hired", ApplicationPipelineStatus.HIRED, 400);
      const held = await seed(a, "ret-held", ApplicationPipelineStatus.REJECTED, 400);
      const retained = await seed(a, "ret-retained", ApplicationPipelineStatus.REJECTED, 400);
      await prisma.retentionHold.create({ data: { companyId: a.companyId, candidateId: held.candidateId, reason: "Open dispute, documented by counsel", placedByUserId: a.adminId } });
      await prisma.candidateDeletionRequest.create({ data: { companyId: a.companyId, candidateId: retained.candidateId, emailNormalized: retained.email, status: "RETAINED", decisionReason: "legal hold" } });
      // An application that is still open keeps the whole candidate.
      const mixed = await seed(a, "ret-mixed", ApplicationPipelineStatus.REJECTED, 400);
      const extraJob = await prisma.job.create({ data: { title: `${MARKER} extra`, status: JobStatus.OPEN, companyId: a.companyId } });
      await prisma.application.create({ data: { candidateId: mixed.candidateId, jobId: extraJob.id, companyId: a.companyId, status: "CV_POOL" } });

      const rules = provider({ [a.companyId]: { CANDIDATE_PERSONAL_DATA: { retainDays: 365, basis: "Customer contract clause 7 (synthetic)", closedStatuses: closed } } });
      const first = await runRetention({ provider: rules, companyIds: [a.companyId] });
      expect(first.mode).toBe("dry-run");
      const cat = first.companies[0]!.categories.find((entry) => entry.category === "CANDIDATE_PERSONAL_DATA")!;
      expect(cat).toMatchObject({ policy: "CONFIGURED", expired: 0, failed: 0 });
      expect(cat.heldBack).toBe(1);
      const ids = [old, recent, open, hired, held, retained, mixed].map((row) => row.candidateId);
      expect(await prisma.candidate.count({ where: { id: { in: ids }, erasedAt: null } })).toBe(ids.length);
      expect(JSON.stringify(first)).not.toContain(SECRET);
      expect(JSON.stringify(first)).not.toContain(MARKER);

      const second = await runRetention({ provider: rules, companyIds: [a.companyId] });
      expect(second.companies[0]!.categories[0]).toEqual(first.companies[0]!.categories[0]);

      // Execute: only the eligible ones go. Tenant B is out of scope. Repeating finds nothing.
      const otherTenant = await seed(b, "ret-b", ApplicationPipelineStatus.REJECTED, 400);
      const executed = await runRetention({ provider: rules, mode: "execute", companyIds: [a.companyId] });
      const eligibleBefore = cat.eligible;
      expect(executed.companies[0]!.categories[0]!.expired).toBe(eligibleBefore);
      const erased = await prisma.candidate.findMany({ where: { id: { in: ids }, erasedAt: { not: null } }, select: { id: true } });
      expect(erased.map((row) => row.id)).toContain(old.candidateId);
      for (const keep of [recent, open, hired, held, retained, mixed]) {
        expect((await prisma.candidate.findUniqueOrThrow({ where: { id: keep.candidateId } })).erasedAt).toBeNull();
      }
      expect((await prisma.candidate.findUniqueOrThrow({ where: { id: otherTenant.candidateId } })).erasedAt).toBeNull();
      const again = await runRetention({ provider: rules, mode: "execute", companyIds: [a.companyId] });
      expect(again.companies[0]!.categories[0]).toMatchObject({ expired: 0, eligible: 0, failed: 0, heldBack: 1 });
      expect(await prisma.auditLog.count({ where: { companyId: a.companyId, action: "RETENTION_EXPIRED", targetId: old.candidateId } })).toBe(1);

      // A hold released later makes the candidate eligible again.
      await prisma.retentionHold.updateMany({ where: { candidateId: held.candidateId }, data: { releasedAt: new Date() } });
      const released = await runRetention({ provider: rules, companyIds: [a.companyId] });
      expect(released.companies[0]!.categories[0]!.eligible).toBe(1);
    });

    it("sanitises old queued email content, keeps held candidates' mail, and never touches other tenants", async () => {
      const oldMail = await seed(a, "mail-old", ApplicationPipelineStatus.CV_POOL, 400);
      const heldMail = await seed(a, "mail-held", ApplicationPipelineStatus.CV_POOL, 400);
      const otherMail = await seed(b, "mail-b", ApplicationPipelineStatus.CV_POOL, 400);
      await prisma.retentionHold.create({ data: { companyId: a.companyId, candidateId: heldMail.candidateId, reason: "Hold for synthetic test", placedByUserId: a.adminId } });
      const rules = provider({ [a.companyId]: { OUTBOUND_EMAIL_CONTENT: { retainDays: 365, basis: "Customer contract clause 9 (synthetic)" } } });
      const dry = await runRetention({ provider: rules, companyIds: [a.companyId] });
      expect(dry.companies[0]!.categories.find((entry) => entry.category === "OUTBOUND_EMAIL_CONTENT")!.heldBack).toBe(1);
      expect((await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: oldMail.emailRowId } })).text).toBe(SECRET);
      await runRetention({ provider: rules, mode: "execute", companyIds: [a.companyId] });
      expect(await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: oldMail.emailRowId } })).toMatchObject({ text: "", subject: "erased", status: "CANCELLED" });
      expect((await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: heldMail.emailRowId } })).text).toBe(SECRET);
      expect((await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: otherMail.emailRowId } })).text).toBe(SECRET);
    });

    it("rejects a rule with no documented basis and refuses execute in production", async () => {
      const bad = provider({ [a.companyId]: { CANDIDATE_PERSONAL_DATA: { retainDays: 180, basis: "", closedStatuses: closed } } });
      const report = await runRetention({ provider: bad, companyIds: [a.companyId] });
      expect(report.companies[0]!.categories[0]!.policy).toBe("INVALID_POLICY");
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      try {
        await expect(runRetention({ provider: bad, mode: "execute" })).rejects.toBeInstanceOf(RetentionExecutionDisabledError);
        await expect(runRetention({ provider: bad })).resolves.toMatchObject({ mode: "dry-run" });
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = saved.node;
      }
    });

    it("surfaces a failed expiry in the report and finishes it on the next run", async () => {
      const row = await seed(a, "ret-fail", ApplicationPipelineStatus.REJECTED, 400);
      const rules = provider({ [a.companyId]: { CANDIDATE_PERSONAL_DATA: { retainDays: 365, basis: "Customer contract clause 7 (synthetic)", closedStatuses: closed } } });
      const failed = await runRetention({ provider: rules, mode: "execute", companyIds: [a.companyId], deps: failing });
      expect(failed.companies[0]!.categories[0]!.failed).toBeGreaterThanOrEqual(1);
      expect(failed.totals.incompleteErasures).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(failed)).not.toContain(SECRET);
      // Expired candidates are tombstoned at once, so pending jobs cannot rebuild them while the retry is waiting.
      expect((await prisma.candidate.findUniqueOrThrow({ where: { id: row.candidateId } })).erasedAt).not.toBeNull();
      const next = await runRetention({ provider: rules, mode: "execute", companyIds: [a.companyId], deps: working });
      expect(next.retriedErasures?.completed).toBeGreaterThanOrEqual(1);
      expect(await prisma.candidateErasure.findFirstOrThrow({ where: { candidateId: row.candidateId } })).toMatchObject({ status: "COMPLETED" });
    });
  });
});

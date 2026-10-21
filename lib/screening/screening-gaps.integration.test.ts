import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApplicationPipelineStatus, CandidateStatus, JobStatus, PortalRole } from "@prisma/client";
import { setGatewayFetchForTests } from "@/lib/ai/gateway";
import { generateAssessmentFromRubric } from "@/lib/assessments/generated-assessment";
import {
  loadCandidateAssessment,
  loadInviteForReview,
  regradeGeneratedAssessment,
  saveAssessmentProgress,
  sendAssessmentLink,
  startGeneratedAssessment,
  submitGeneratedAssessment,
} from "@/lib/assessments/generated-assessment-service";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";
import { approveCloseOut, cancelCloseOut, proposeCloseOut } from "@/lib/screening/close-out-service";
import { listMustHaves, saveMustHaves } from "@/lib/screening/must-haves";
import { assignPractical, similarPracticalSubmissions, submitPractical, suggestPracticalScores } from "@/lib/screening/practical-service";
import { loadScreeningPool } from "@/lib/screening/screening-data";
import { saveScreeningPolicy } from "@/lib/screening/screening-policy-service";
import { DEFAULT_SCREENING_POLICY } from "@/lib/screening/screening-policy";
import { ensureWeeklySpotCheck, reviewSpotCheck } from "@/lib/screening/spot-checks";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `gaps-${process.pid}-${Date.now()}`;
const PRACTICAL =
  "I wrote the importer as a streaming parser so memory stays flat on large files. Each row is validated against the schema, rejected rows go to a report with the line number and reason, and duplicate ids are detected with a set keyed by the natural id. Retries use exponential backoff with jitter and stop after five attempts. Tests cover malformed rows, duplicates, empty files and a network failure in the middle of a batch.";
const MUST_HAVES = [
  { requirement: "Work authorisation", question: "Are you authorised to work in India?", expectedAnswer: "yes" },
  { requirement: "On-call", question: "Can you join a weekly on-call rota?", expectedAnswer: "yes" },
  { requirement: "Notice period", question: "Is your notice period longer than 90 days?", expectedAnswer: "no" },
] as const;

function policyValues() {
  const values: Record<string, unknown> = { ...DEFAULT_SCREENING_POLICY };
  delete values.id;
  delete values.version;
  return { ...values, basicPassPercent: 60, practicalPassPercent: 60, practicalTitle: "Data importer", practicalInstructions: "Build a small CSV importer." };
}

describe.skipIf(integrationDatabase.mode === "skip")("screening gap fixes", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const saved = { openai: process.env.OPENAI_API_KEY, resend: process.env.RESEND_API_KEY };
  type Tenant = { companyId: number; adminId: number; jobId: number; applicationIds: number[] };
  let a: Tenant;
  let b: Tenant;

  async function tenant(label: string, applicants: number): Promise<Tenant> {
    const company = await prisma.company.create({
      data: { name: `${MARKER} ${label}`, industry: "Test", employees: 5, publicSlug: `${MARKER}-${label}`.toLowerCase().replace(/[^a-z0-9-]/g, "") },
    });
    companyIds.push(company.id);
    const admin = await prisma.user.create({
      data: { email: `${MARKER}-${label}@hireiq.test`.toLowerCase(), name: `${label} admin`, role: PortalRole.ADMIN, passwordHash: "not-a-login", emailVerifiedAt: new Date(), companyId: company.id },
    });
    userIds.push(admin.id);
    const job = await prisma.job.create({ data: { title: `${MARKER} ${label} role`, status: JobStatus.OPEN, companyId: company.id } });
    await prisma.generatedAssessment.create({
      data: {
        jobId: job.id,
        companyId: company.id,
        version: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
        timeLimitMinutes: 20,
        drawCount: 8,
        items: generateAssessmentFromRubric({ requirements: ["SQL", "APIs", "Testing", "Debugging", "Data modelling", "Communication"], rubric: [] }),
      },
    });
    const applicationIds: number[] = [];
    for (let index = 0; index < applicants; index += 1) {
      const candidate = await prisma.candidate.create({
        data: { name: `${label} candidate ${index}`, role: "Engineer", experienceYears: 3, status: CandidateStatus.APPLIED, companyId: company.id },
      });
      applicationIds.push((await prisma.application.create({ data: { candidateId: candidate.id, jobId: job.id, companyId: company.id, aiPreference: "ALLOWED" } })).id);
    }
    await saveScreeningPolicy({ jobId: job.id, companyId: company.id, actorUserId: admin.id, values: policyValues() });
    return { companyId: company.id, adminId: admin.id, jobId: job.id, applicationIds };
  }

  beforeAll(async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.RESEND_API_KEY;
    a = await tenant("a", 8);
    b = await tenant("b", 2);
  });

  afterAll(async () => {
    setGatewayFetchForTests(null);
    process.env.OPENAI_API_KEY = saved.openai;
    process.env.RESEND_API_KEY = saved.resend;
    if (companyIds.length === 0) return;
    const companyId = { in: companyIds };
    await prisma.spotCheck.deleteMany({ where: { companyId } });
    await prisma.closeOutBatch.deleteMany({ where: { companyId } });
    await prisma.knockoutQuestion.deleteMany({ where: { companyId } });
    await prisma.practicalCriterionScore.deleteMany({ where: { companyId } });
    await prisma.stageReminder.deleteMany({ where: { companyId } });
    await prisma.codingTest.deleteMany({ where: { application: { companyId } } });
    await prisma.jobScreeningPolicy.deleteMany({ where: { companyId } });
    await prisma.generatedAssessmentInvite.deleteMany({ where: { assessment: { companyId } } });
    await prisma.generatedAssessment.deleteMany({ where: { companyId } });
    await prisma.decisionRecord.deleteMany({ where: { companyId } });
    await prisma.outcomeEvent.deleteMany({ where: { companyId } });
    await prisma.aIRun.deleteMany({ where: { companyId } });
    await deleteAuditLogsForTests({ companyId });
    await prisma.application.deleteMany({ where: { companyId } });
    await prisma.candidate.deleteMany({ where: { companyId } });
    await prisma.job.deleteMany({ where: { companyId } });
    await prisma.organizationMember.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  });

  it("saves 3-5 must-haves per company and refuses other counts or another company's job", async () => {
    expect((await saveMustHaves({ jobId: a.jobId, companyId: a.companyId, actorUserId: a.adminId, items: MUST_HAVES.slice(0, 2) })).ok).toBe(false);
    expect((await saveMustHaves({ jobId: a.jobId, companyId: a.companyId, actorUserId: a.adminId, items: [...MUST_HAVES, ...MUST_HAVES] })).ok).toBe(false);
    expect(await saveMustHaves({ jobId: b.jobId, companyId: a.companyId, actorUserId: a.adminId, items: MUST_HAVES })).toEqual({ ok: false, error: "Job not found." });
    expect(await saveMustHaves({ jobId: a.jobId, companyId: a.companyId, actorUserId: a.adminId, items: [...MUST_HAVES, { requirement: "SQL", question: "Have you used SQL at work?", expectedAnswer: "yes" }] })).toEqual({ ok: true, count: 4 });
    expect(await saveMustHaves({ jobId: a.jobId, companyId: a.companyId, actorUserId: a.adminId, items: MUST_HAVES })).toEqual({ ok: true, count: 3 });
    expect(await listMustHaves(a.jobId, a.companyId)).toEqual(MUST_HAVES);
    expect(await prisma.knockoutQuestion.count({ where: { jobId: a.jobId } })).toBe(3);
    expect(await prisma.auditLog.count({ where: { companyId: a.companyId, action: "MUST_HAVES_SAVED" } })).toBe(2);
  });

  it("puts a failed must-have under 'Doesn't meet stated requirements' without changing the stage", async () => {
    const [first, second] = a.applicationIds;
    await prisma.application.updateMany({ where: { id: { in: [first!, second!] } }, data: { knockoutFailedAt: new Date() } });
    const pool = await loadScreeningPool(a.jobId, a.companyId);
    for (const id of [first!, second!]) {
      const row = pool!.rows.find((entry) => entry.applicationId === id)!;
      expect(row.evaluation.category).toBe("NOT_MET");
      expect(row.status).toBe(ApplicationPipelineStatus.CV_POOL);
    }
    expect(pool!.summary.categoryCounts.NOT_MET).toBe(2);
  });

  it("closes out only after a separate approval with the matching count, and skips candidates who asked for a person", async () => {
    const [first, second, third] = a.applicationIds;
    expect((await proposeCloseOut({ jobId: a.jobId, companyId: a.companyId, actorUserId: a.adminId, reason: "made up", category: "NOT_MET" })).ok).toBe(false);
    expect((await proposeCloseOut({ jobId: a.jobId, companyId: b.companyId, actorUserId: b.adminId, reason: "Missing required skill", category: "NOT_MET" })).ok).toBe(false);

    const proposal = await proposeCloseOut({ jobId: a.jobId, companyId: a.companyId, actorUserId: a.adminId, reason: "Missing required skill", category: "NOT_MET" });
    expect(proposal).toMatchObject({ ok: true, count: 2 });
    if (!proposal.ok) throw new Error(proposal.error);
    const statuses = await prisma.application.findMany({ where: { id: { in: [first!, second!] } }, select: { status: true } });
    expect(statuses.every((row) => row.status === ApplicationPipelineStatus.CV_POOL)).toBe(true);

    expect(await approveCloseOut({ batchId: proposal.id, companyId: b.companyId, actorUserId: b.adminId, confirmCount: 2 })).toMatchObject({ ok: false });
    expect(await approveCloseOut({ batchId: proposal.id, companyId: a.companyId, actorUserId: a.adminId, confirmCount: 3 })).toMatchObject({ ok: false });
    expect(await approveCloseOut({ batchId: proposal.id, companyId: a.companyId, actorUserId: a.adminId, confirmCount: 2, now: new Date(Date.now() + 8 * 24 * 3600 * 1000) })).toMatchObject({ ok: false });

    await prisma.application.update({ where: { id: second! }, data: { humanReviewRequestedAt: new Date() } });
    const approved = await approveCloseOut({ batchId: proposal.id, companyId: a.companyId, actorUserId: a.adminId, confirmCount: 2 });
    expect(approved).toMatchObject({ ok: true, closed: [first], skipped: [{ id: second }] });
    const after = await prisma.application.findMany({ where: { id: { in: [first!, second!, third!] } }, orderBy: { id: "asc" }, select: { status: true } });
    expect(after.map((row) => row.status)).toEqual([ApplicationPipelineStatus.REJECTED, ApplicationPipelineStatus.CV_POOL, ApplicationPipelineStatus.CV_POOL]);
    expect(await prisma.decisionRecord.count({ where: { applicationId: first! } })).toBe(1);
    expect(await approveCloseOut({ batchId: proposal.id, companyId: a.companyId, actorUserId: a.adminId, confirmCount: 2 })).toMatchObject({ ok: false });
    expect((await cancelCloseOut({ batchId: proposal.id, companyId: a.companyId, actorUserId: a.adminId })).ok).toBe(false);

    const actions = await prisma.auditLog.findMany({ where: { companyId: a.companyId, action: { startsWith: "CLOSE_OUT_" } }, select: { action: true } });
    expect(actions.map((row) => row.action).sort()).toEqual(["CLOSE_OUT_APPROVED", "CLOSE_OUT_PROPOSED"]);

    const cancelled = await proposeCloseOut({ jobId: a.jobId, companyId: a.companyId, actorUserId: a.adminId, reason: "Missing required skill", applicationIds: [third!] });
    if (!cancelled.ok) throw new Error(cancelled.error);
    expect((await cancelCloseOut({ batchId: cancelled.id, companyId: a.companyId, actorUserId: a.adminId })).ok).toBe(true);
    expect((await approveCloseOut({ batchId: cancelled.id, companyId: a.companyId, actorUserId: a.adminId, confirmCount: 1 })).ok).toBe(false);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: third! }, select: { status: true } })).status).toBe(ApplicationPipelineStatus.CV_POOL);
  });

  it("makes no AI call for an opted-out candidate on submit, regrade or practical suggestion; an opted-in control does", async () => {
    let calls = 0;
    const reply = async () => {
      calls += 1;
      return Response.json({ choices: [{ message: { content: JSON.stringify({ score: 1, rationale: "ok", criteria: [] }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    };
    const optedOut = a.applicationIds[4]!;
    const control = a.applicationIds[5]!;
    await prisma.application.update({ where: { id: optedOut }, data: { aiEvaluationOptOut: true } });
    process.env.OPENAI_API_KEY = "test-key";
    setGatewayFetchForTests(reply);
    try {
      async function takeAndSubmit(applicationId: number) {
        const link = await sendAssessmentLink({ applicationId, actorUserId: a.adminId, companyId: a.companyId });
        await startGeneratedAssessment(link.rawToken);
        const page = await loadCandidateAssessment(link.rawToken);
        const written = page && !page.closed ? page.items.find((item) => item.type === "short_answer" || item.type === "scenario") : undefined;
        expect(written).toBeDefined();
        await saveAssessmentProgress(link.rawToken, { [written!.id]: "I would add an index and compare query plans." });
        await submitGeneratedAssessment(link.rawToken, null);
        await new Promise((resolve) => setTimeout(resolve, 200));
        return link.inviteId;
      }

      const inviteId = await takeAndSubmit(optedOut);
      await regradeGeneratedAssessment({ inviteId, companyId: a.companyId, actorUserId: a.adminId }).catch(() => undefined);
      const practical = await assignPractical({ applicationId: optedOut, companyId: a.companyId, actorUserId: a.adminId });
      await submitPractical(practical.url.split("/practical/")[1]!, { text: PRACTICAL });
      await expect(suggestPracticalScores({ codingTestId: practical.codingTestId, companyId: a.companyId, actorUserId: a.adminId })).rejects.toThrow();
      expect(calls).toBe(0);
      const review = await loadInviteForReview(optedOut, a.companyId);
      const graded = review!.items.filter((item) => (item.type === "short_answer" || item.type === "scenario") && item.answer);
      expect(graded[0]!.grade).toMatchObject({ score: null, needsHuman: true });

      await takeAndSubmit(control);
      expect(calls).toBeGreaterThan(0);
    } finally {
      setGatewayFetchForTests(null);
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("flags near-identical practical submissions for a person without touching scores", async () => {
    const one = a.applicationIds[6]!;
    const two = a.applicationIds[7]!;
    const first = await assignPractical({ applicationId: one, companyId: a.companyId, actorUserId: a.adminId });
    const second = await assignPractical({ applicationId: two, companyId: a.companyId, actorUserId: a.adminId });
    await submitPractical(first.url.split("/practical/")[1]!, { text: PRACTICAL });
    await submitPractical(second.url.split("/practical/")[1]!, { text: `${PRACTICAL} Thanks for reading.` });
    const scoresBefore = await prisma.codingTest.findMany({ where: { id: { in: [first.codingTestId, second.codingTestId] } }, orderBy: { id: "asc" }, select: { score: true, gradedAt: true } });
    const similar = await similarPracticalSubmissions(first.codingTestId, a.companyId);
    expect(similar.map((row) => row.applicationId)).toContain(two);
    expect(similar.every((row) => row.similarity >= 0.6)).toBe(true);
    expect(await similarPracticalSubmissions(first.codingTestId, b.companyId)).toEqual([]);
    const scoresAfter = await prisma.codingTest.findMany({ where: { id: { in: [first.codingTestId, second.codingTestId] } }, orderBy: { id: "asc" }, select: { score: true, gradedAt: true } });
    expect(scoresAfter).toEqual(scoresBefore);
    expect(scoresAfter.every((row) => row.gradedAt === null)).toBe(true);
  });

  it("draws at most five below-cutoff candidates once per week, even when run concurrently", async () => {
    const now = new Date();
    const runs = await Promise.all([
      ensureWeeklySpotCheck({ jobId: a.jobId, companyId: a.companyId, now }),
      ensureWeeklySpotCheck({ jobId: a.jobId, companyId: a.companyId, now }),
    ]);
    const rows = await prisma.spotCheck.findMany({ where: { jobId: a.jobId } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(5);
    expect(runs.reduce((sum, run) => sum + run.created, 0)).toBe(rows.length);
    expect((await ensureWeeklySpotCheck({ jobId: a.jobId, companyId: a.companyId, now })).created).toBe(0);
    expect(new Set(rows.map((row) => row.applicationId)).size).toBe(rows.length);

    const target = rows[0]!;
    expect((await reviewSpotCheck({ spotCheckId: target.id, jobId: a.jobId, companyId: a.companyId, actorUserId: a.adminId, outcome: "SHOULD_RECONSIDER", note: "" })).ok).toBe(false);
    expect((await reviewSpotCheck({ spotCheckId: target.id, jobId: a.jobId, companyId: b.companyId, actorUserId: b.adminId, outcome: "PLACEMENT_OK", note: "" })).ok).toBe(false);
    expect((await reviewSpotCheck({ spotCheckId: target.id, jobId: a.jobId, companyId: a.companyId, actorUserId: a.adminId, outcome: "SHOULD_RECONSIDER", note: "Strong practical; re-read." })).ok).toBe(true);
    expect((await reviewSpotCheck({ spotCheckId: target.id, jobId: a.jobId, companyId: a.companyId, actorUserId: a.adminId, outcome: "PLACEMENT_OK", note: "" })).ok).toBe(false);
    expect(await prisma.auditLog.count({ where: { companyId: a.companyId, action: "SPOT_CHECK_REVIEWED" } })).toBe(1);
  });
});

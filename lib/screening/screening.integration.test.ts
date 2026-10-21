import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApplicationPipelineStatus, CandidateStatus, JobStatus, PortalRole } from "@prisma/client";
import { setGatewayFetchForTests } from "@/lib/ai/gateway";
import { generateAssessmentFromRubric } from "@/lib/assessments/generated-assessment";
import {
  loadCandidateAssessment,
  loadInviteForReview,
  overrideAssessmentGrade,
  saveAssessmentProgress,
  sendAssessmentLink,
  startGeneratedAssessment,
  submitGeneratedAssessment,
} from "@/lib/assessments/generated-assessment-service";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";
import { applyReviewDecision, humanReviewRequestedIds } from "@/lib/review/review-queue-service";
import { loadScreeningPool } from "@/lib/screening/screening-data";
import { assignPractical, recordPracticalScores, submitPractical, suggestPracticalScores } from "@/lib/screening/practical-service";
import { getCurrentScreeningPolicy, saveScreeningPolicy } from "@/lib/screening/screening-policy-service";
import { DEFAULT_SCREENING_POLICY } from "@/lib/screening/screening-policy";
import { sendDueStageReminders } from "@/lib/screening/stage-reminders";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `screening-${process.pid}-${Date.now()}`;
const SUBMISSION = "I built the importer as a streaming parser, added retries with backoff, and wrote tests for malformed rows and duplicate ids.";

function policyValues(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { ...DEFAULT_SCREENING_POLICY };
  delete values.id;
  delete values.version;
  return {
    ...values,
    basicPassPercent: 60,
    practicalPassPercent: 60,
    practicalTitle: "Data importer",
    practicalInstructions: "Build a small CSV importer.",
    ...overrides,
  };
}

describe.skipIf(integrationDatabase.mode === "skip")("screening workflow", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const saved = { openai: process.env.OPENAI_API_KEY, resend: process.env.RESEND_API_KEY };
  let tenantA: { companyId: number; adminId: number; jobId: number; applicationIds: number[] };
  let tenantB: { companyId: number; adminId: number; jobId: number; applicationIds: number[] };

  async function tenant(label: string, applicants: number) {
    const company = await prisma.company.create({
      data: { name: `${MARKER} ${label}`, industry: "Test", employees: 5, publicSlug: `${MARKER}-${label}`.toLowerCase().replace(/[^a-z0-9-]/g, "") },
    });
    companyIds.push(company.id);
    const admin = await prisma.user.create({
      data: {
        email: `${MARKER}-${label}@hireiq.test`.toLowerCase(),
        name: `${label} admin`,
        role: PortalRole.ADMIN,
        passwordHash: "not-a-login",
        emailVerifiedAt: new Date(),
        companyId: company.id,
      },
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
        drawCount: 12,
        items: generateAssessmentFromRubric({
          requirements: ["SQL", "APIs", "Testing", "Debugging", "Data modelling", "Communication"],
          rubric: [{ criterion: "Backend", signal: "Production work" }],
        }),
      },
    });
    const applicationIds: number[] = [];
    for (let index = 0; index < applicants; index += 1) {
      const candidate = await prisma.candidate.create({
        data: { name: `${label} candidate ${index}`, role: "Engineer", experienceYears: 3, status: CandidateStatus.APPLIED, companyId: company.id },
      });
      const application = await prisma.application.create({ data: { candidateId: candidate.id, jobId: job.id, companyId: company.id, aiPreference: "ALLOWED" } });
      applicationIds.push(application.id);
    }
    return { companyId: company.id, adminId: admin.id, jobId: job.id, applicationIds };
  }

  beforeAll(async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.RESEND_API_KEY;
    tenantA = await tenant("a", 4);
    tenantB = await tenant("b", 1);
  });

  afterAll(async () => {
    setGatewayFetchForTests(null);
    process.env.OPENAI_API_KEY = saved.openai;
    process.env.RESEND_API_KEY = saved.resend;
    if (companyIds.length === 0) return;
    const companyId = { in: companyIds };
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

  it("keeps every screening read and write inside the caller's company", async () => {
    const [applicationB] = tenantB.applicationIds;
    expect(await loadScreeningPool(tenantB.jobId, tenantA.companyId)).toBeNull();
    expect(await loadInviteForReview(applicationB!, tenantA.companyId)).toBeNull();
    const policy = await saveScreeningPolicy({ jobId: tenantB.jobId, companyId: tenantA.companyId, actorUserId: tenantA.adminId, values: policyValues() });
    expect(policy).toEqual({ ok: false, error: "Job not found." });
    await expect(sendAssessmentLink({ applicationId: applicationB!, actorUserId: tenantA.adminId, companyId: tenantA.companyId })).rejects.toThrow(/not found/i);
    await expect(assignPractical({ applicationId: applicationB!, companyId: tenantA.companyId, actorUserId: tenantA.adminId })).rejects.toThrow(/not found/i);

    await saveScreeningPolicy({ jobId: tenantB.jobId, companyId: tenantB.companyId, actorUserId: tenantB.adminId, values: policyValues() });
    const assignedB = await assignPractical({ applicationId: applicationB!, companyId: tenantB.companyId, actorUserId: tenantB.adminId });
    await expect(
      recordPracticalScores({ codingTestId: assignedB.codingTestId, companyId: tenantA.companyId, actorUserId: tenantA.adminId, scores: [{ criterionKey: "correctness", points: 5 }] }),
    ).rejects.toThrow(/not found/i);
    const linkB = await sendAssessmentLink({ applicationId: applicationB!, actorUserId: tenantB.adminId, companyId: tenantB.companyId });
    await expect(
      overrideAssessmentGrade({ inviteId: linkB.inviteId, itemId: "item-1", score: 1, reason: "cross tenant", actorUserId: tenantA.adminId, companyId: tenantA.companyId }),
    ).rejects.toThrow(/not found/i);
  });

  it("validates and versions the screening policy; old assignments keep their rubric", async () => {
    const bad = await saveScreeningPolicy({ jobId: tenantA.jobId, companyId: tenantA.companyId, actorUserId: tenantA.adminId, values: policyValues({ basicWeight: 35 }) });
    expect(bad.ok).toBe(false);
    const first = await saveScreeningPolicy({ jobId: tenantA.jobId, companyId: tenantA.companyId, actorUserId: tenantA.adminId, values: policyValues() });
    expect(first).toMatchObject({ ok: true, version: 1 });

    const applicationId = tenantA.applicationIds[0]!;
    const assigned = await assignPractical({ applicationId, companyId: tenantA.companyId, actorUserId: tenantA.adminId });
    expect(assigned.emailOutcome).toBe("no-email");
    const reissued = await assignPractical({ applicationId, companyId: tenantA.companyId, actorUserId: tenantA.adminId });
    expect(reissued).toMatchObject({ codingTestId: assigned.codingTestId, reused: true });

    const second = await saveScreeningPolicy({
      jobId: tenantA.jobId,
      companyId: tenantA.companyId,
      actorUserId: tenantA.adminId,
      values: policyValues({ practicalRubric: [{ key: "overall", label: "Overall", description: "", maxPoints: 10 }] }),
    });
    expect(second).toMatchObject({ ok: true, version: 2 });
    expect((await getCurrentScreeningPolicy(tenantA.jobId, tenantA.companyId)).version).toBe(2);

    const token = reissued.url.split("/practical/")[1]!;
    await submitPractical(token, { text: SUBMISSION });
    await expect(
      recordPracticalScores({ codingTestId: assigned.codingTestId, companyId: tenantA.companyId, actorUserId: tenantA.adminId, scores: [{ criterionKey: "overall", points: 8 }] }),
    ).rejects.toThrow(/unknown or repeated criterion/);
    const partial = await recordPracticalScores({
      codingTestId: assigned.codingTestId,
      companyId: tenantA.companyId,
      actorUserId: tenantA.adminId,
      scores: [{ criterionKey: "correctness", points: 4 }],
    });
    expect(partial.complete).toBe(false);
    const done = await recordPracticalScores({
      codingTestId: assigned.codingTestId,
      companyId: tenantA.companyId,
      actorUserId: tenantA.adminId,
      scores: ["quality", "testing", "reasoning"].map((criterionKey) => ({ criterionKey, points: 4 })),
    });
    expect(done.complete).toBe(true);
    await expect(
      recordPracticalScores({ codingTestId: assigned.codingTestId, companyId: tenantA.companyId, actorUserId: tenantA.adminId, scores: [{ criterionKey: "correctness", points: 2 }] }),
    ).rejects.toThrow(/give a reason/);
    await recordPracticalScores({
      codingTestId: assigned.codingTestId,
      companyId: tenantA.companyId,
      actorUserId: tenantA.adminId,
      scores: [{ criterionKey: "correctness", points: 2, rationale: "Edge cases fail on re-read." }],
    });
    const row = await prisma.codingTest.findUniqueOrThrow({ where: { id: assigned.codingTestId }, select: { score: true, maxScore: true, status: true } });
    expect(row).toEqual({ score: 14, maxScore: 20, status: "COMPLETED" });
    expect(await prisma.practicalCriterionScore.count({ where: { codingTestId: assigned.codingTestId } })).toBe(5);
  });

  it("accepts exactly one of two simultaneous submissions", async () => {
    const applicationId = tenantA.applicationIds[1]!;
    const link = await sendAssessmentLink({ applicationId, actorUserId: tenantA.adminId, companyId: tenantA.companyId });
    await startGeneratedAssessment(link.rawToken);
    const page = await loadCandidateAssessment(link.rawToken);
    const writtenItem = page && !page.closed ? page.items.find((item) => item.type === "short_answer" || item.type === "scenario") : undefined;
    expect(writtenItem).toBeDefined();
    await saveAssessmentProgress(link.rawToken, { [writtenItem!.id]: "I would add an index and check the query plan before and after." });
    const results = await Promise.allSettled([submitGeneratedAssessment(link.rawToken, null), submitGeneratedAssessment(link.rawToken, null)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason)).toMatch(/already submitted/);

    const practical = await assignPractical({ applicationId, companyId: tenantA.companyId, actorUserId: tenantA.adminId });
    const token = practical.url.split("/practical/")[1]!;
    const submits = await Promise.allSettled([submitPractical(token, { text: SUBMISSION }), submitPractical(token, { text: SUBMISSION })]);
    expect(submits.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("never fabricates a score when grading is unavailable", async () => {
    const applicationId = tenantA.applicationIds[1]!;
    const review = await loadInviteForReview(applicationId, tenantA.companyId);
    expect(review?.gradedAt).not.toBeNull();
    const answered = review!.items.filter((item) => (item.type === "short_answer" || item.type === "scenario") && item.answer);
    expect(answered).toHaveLength(1);
    expect(answered[0]!.grade).toMatchObject({ score: null, needsHuman: true, reason: "ai-unavailable" });
    const pool = await loadScreeningPool(tenantA.jobId, tenantA.companyId);
    const row = pool!.rows.find((entry) => entry.applicationId === applicationId)!;
    expect(row.evaluation.components.basic.percent).toBeNull();
    expect(row.evaluation.combined).toBeNull();
  });

  it("stores nothing when the AI provider fails, and drops suggestions without a verbatim quote", async () => {
    const applicationId = tenantA.applicationIds[1]!;
    const practical = await prisma.codingTest.findFirstOrThrow({ where: { applicationId, screeningPolicyId: { not: null } }, select: { id: true } });
    process.env.OPENAI_API_KEY = "test-key";
    try {
      setGatewayFetchForTests(async () => new Response("upstream down", { status: 503 }));
      await expect(suggestPracticalScores({ codingTestId: practical.id, companyId: tenantA.companyId, actorUserId: tenantA.adminId })).rejects.toThrow(
        /No score was recorded/,
      );
      expect(await prisma.practicalCriterionScore.count({ where: { codingTestId: practical.id } })).toBe(0);

      const reply = (criteria: unknown[]) => async () =>
        Response.json({ choices: [{ message: { content: JSON.stringify({ criteria }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
      setGatewayFetchForTests(reply([{ key: "overall", points: 9, quote: "100% coverage everywhere", rationale: "Invented." }]));
      expect(await suggestPracticalScores({ codingTestId: practical.id, companyId: tenantA.companyId, actorUserId: tenantA.adminId })).toEqual({ suggested: 0, dropped: 1 });
      setGatewayFetchForTests(reply([{ key: "overall", points: 99, quote: "streaming parser", rationale: "Out of range." }]));
      expect(await suggestPracticalScores({ codingTestId: practical.id, companyId: tenantA.companyId, actorUserId: tenantA.adminId })).toEqual({ suggested: 0, dropped: 1 });
      expect(await prisma.practicalCriterionScore.count({ where: { codingTestId: practical.id } })).toBe(0);

      setGatewayFetchForTests(reply([{ key: "overall", points: 7, quote: "streaming parser, added retries", rationale: "Handles retries." }]));
      const result = await suggestPracticalScores({ codingTestId: practical.id, companyId: tenantA.companyId, actorUserId: tenantA.adminId });
      expect(result).toEqual({ suggested: 1, dropped: 0 });
      const rows = await prisma.practicalCriterionScore.findMany({ where: { codingTestId: practical.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ source: "AI_SUGGESTED", gradedByUserId: null });
      const test = await prisma.codingTest.findUniqueOrThrow({ where: { id: practical.id }, select: { gradedAt: true } });
      expect(test.gradedAt).toBeNull();
    } finally {
      setGatewayFetchForTests(null);
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("lets only one of two simultaneous stage changes win, and records each decision", async () => {
    const applicationId = tenantA.applicationIds[2]!;
    const results = await Promise.allSettled([
      applyReviewDecision({ applicationId, actorUserId: tenantA.adminId, action: "advance" }),
      applyReviewDecision({ applicationId, actorUserId: tenantA.adminId, action: "advance" }),
    ]);
    const winners = results.filter((result) => result.status === "fulfilled");
    const after = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, select: { status: true } });
    expect(winners.length).toBeGreaterThanOrEqual(1);
    expect(after.status).toBe(winners.length === 1 ? ApplicationPipelineStatus.EXPERT_REVIEW : ApplicationPipelineStatus.TECH_EVALUATION);
    expect(await prisma.decisionRecord.count({ where: { applicationId } })).toBe(winners.length);
  });

  it("undoes only the latest change and refuses a forged undo target", async () => {
    const applicationId = tenantA.applicationIds[3]!;
    await applyReviewDecision({ applicationId, actorUserId: tenantA.adminId, action: "reject", reason: "Missing required skill", note: "Checked the practical." });
    await expect(
      applyReviewDecision({ applicationId, actorUserId: tenantA.adminId, action: "undo", undoTo: ApplicationPipelineStatus.HIRED }),
    ).rejects.toThrow(/not available/);
    await applyReviewDecision({ applicationId, actorUserId: tenantA.adminId, action: "undo" });
    const row = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, select: { status: true } });
    expect(row.status).toBe(ApplicationPipelineStatus.CV_POOL);
    await expect(applyReviewDecision({ applicationId, actorUserId: tenantA.adminId, action: "undo" })).rejects.toThrow(/not available/);
    const decisions = await prisma.decisionRecord.findMany({ where: { applicationId }, orderBy: { id: "asc" } });
    expect(decisions.map((decision) => decision.rationale.split(":")[0])).toEqual(["reject", "undo"]);
    expect(decisions[0]!.rationale).toContain("Checked the practical.");
  });

  it("reads the human-review block from the database, not the client", async () => {
    const applicationId = tenantA.applicationIds[3]!;
    await prisma.application.update({ where: { id: applicationId }, data: { humanReviewRequestedAt: new Date() } });
    const blocked = await humanReviewRequestedIds([...tenantA.applicationIds, ...tenantB.applicationIds], tenantA.companyId);
    expect([...blocked]).toEqual([applicationId]);
  });

  it("sends one deadline reminder per open item, however often the sweep runs", async () => {
    const applicationId = tenantA.applicationIds[0]!;
    const practical = await assignPractical({ applicationId, companyId: tenantA.companyId, actorUserId: tenantA.adminId, reassign: true });
    await prisma.codingTest.update({ where: { id: practical.codingTestId }, data: { dueAt: new Date(Date.now() + 6 * 60 * 60 * 1000) } });
    const runs = await Promise.all([
      sendDueStageReminders(new Date(), { companyId: tenantA.companyId }),
      sendDueStageReminders(new Date(), { companyId: tenantA.companyId }),
    ]);
    await sendDueStageReminders(new Date(), { companyId: tenantA.companyId });
    const reminders = await prisma.stageReminder.findMany({ where: { targetType: "CODING_TEST", targetId: practical.codingTestId } });
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.outcome).toBe("no-email");
    expect(runs.reduce((sum, run) => sum + run.skipped, 0)).toBeGreaterThanOrEqual(1);

    await prisma.application.update({ where: { id: applicationId }, data: { status: ApplicationPipelineStatus.REJECTED } });
    const closed = await sendDueStageReminders(new Date(), { companyId: tenantA.companyId });
    expect(closed.due).toBe(0);
  });
});

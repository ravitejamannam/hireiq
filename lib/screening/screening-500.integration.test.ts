import "@/lib/evidence-graph/evidence-graph-test-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { ApplicationPipelineStatus, CandidateStatus, JobStatus, PortalRole } from "@prisma/client";
import { setGatewayFetchForTests } from "@/lib/ai/gateway";
import { generateAssessmentFromRubric, parseAssessmentItems } from "@/lib/assessments/generated-assessment";
import {
  saveAssessmentProgress,
  sendAssessmentLink,
  startGeneratedAssessment,
  submitGeneratedAssessment,
} from "@/lib/assessments/generated-assessment-service";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { approveCloseOut, proposeCloseOut } from "@/lib/screening/close-out-service";
import { assignPractical, recordPracticalScores, submitPractical } from "@/lib/screening/practical-service";
import { loadScreeningPool } from "@/lib/screening/screening-data";
import { loadScreeningFunnel } from "@/lib/screening/screening-funnel";
import { saveScreeningPolicy } from "@/lib/screening/screening-policy-service";
import { DEFAULT_SCREENING_POLICY } from "@/lib/screening/screening-policy";
import { ensureWeeklySpotCheck } from "@/lib/screening/spot-checks";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const APPLICANTS = 500;
const ENABLED = process.env.SCREENING_E2E_500 === "1" && integrationDatabase.mode === "accept";
const KEEP = process.env.SCREENING_E2E_KEEP === "1";
const MARKER = KEEP ? "screening-demo-synthetic" : `e2e500-${process.pid}-${Date.now()}`;
const PRACTICAL = (index: number) =>
  `Submission ${index}. I wrote the importer as a streaming parser, validated each row against the schema, and reported rejected rows with line numbers. Duplicate ids are caught with a set. Retries use backoff with jitter. Tests cover malformed rows, duplicates and empty files. Candidate-specific note ${index * 7919}.`;

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function inBatches<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  for (let at = 0; at < items.length; at += size) await Promise.all(items.slice(at, at + size).map(run));
}

async function deleteCompany(companyId: number) {
  const where = { companyId };
  await prisma.spotCheck.deleteMany({ where });
  await prisma.closeOutBatch.deleteMany({ where });
  await prisma.practicalCriterionScore.deleteMany({ where });
  await prisma.stageReminder.deleteMany({ where });
  await prisma.codingTest.deleteMany({ where: { application: where } });
  await prisma.jobScreeningPolicy.deleteMany({ where });
  await prisma.generatedAssessmentInvite.deleteMany({ where: { assessment: where } });
  await prisma.generatedAssessment.deleteMany({ where });
  await prisma.requirementMatch.deleteMany({ where });
  await prisma.candidateMatchRun.deleteMany({ where });
  await prisma.candidateClaim.deleteMany({ where });
  await prisma.candidateIntelligenceRun.deleteMany({ where });
  await prisma.candidateEvidence.deleteMany({ where });
  await prisma.decisionRecord.deleteMany({ where });
  await prisma.outcomeEvent.deleteMany({ where });
  await prisma.aIRun.deleteMany({ where });
  await deleteAuditLogsForTests(where);
  await prisma.application.deleteMany({ where });
  await prisma.candidate.deleteMany({ where });
  await prisma.jobSpecificationVersion.deleteMany({ where: { job: where } });
  await prisma.job.deleteMany({ where });
  await prisma.organizationMember.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

describe.skipIf(!ENABLED)("500 synthetic applicants through the staged funnel (local database only)", () => {
  let companyId = 0;
  let adminId = 0;
  const saved = { openai: process.env.OPENAI_API_KEY, resend: process.env.RESEND_API_KEY };

  afterAll(async () => {
    setGatewayFetchForTests(null);
    process.env.OPENAI_API_KEY = saved.openai;
    process.env.RESEND_API_KEY = saved.resend;
    if (!companyId || KEEP) return;
    await deleteCompany(companyId);
    const left = await prisma.application.count({ where: { companyId } });
    expect(left).toBe(0);
  });

  it("ranks, gates and closes out 500 applicants with every decision taken by a person", { timeout: 15 * 60 * 1000 }, async () => {
    const random = rng(20261019);
    const started = Date.now();
    delete process.env.RESEND_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    let aiCalls = 0;
    setGatewayFetchForTests(async (_url, init) => {
      aiCalls += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role: string; content: string }> };
      const user = JSON.parse(body.messages?.find((message) => message.role === "user")?.content ?? "{}") as { answer?: string };
      const match = /quality (\d)/.exec(user.answer ?? "");
      const content = match ? { score: Number(match[1]), quote: match[0], confidence: "high" } : { score: 1, quote: null, confidence: "low" };
      return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    });

    const previous = await prisma.company.findUnique({ where: { publicSlug: MARKER }, select: { id: true } });
    if (previous) await deleteCompany(previous.id);
    const company = await prisma.company.create({ data: { name: `${MARKER} synthetic`, industry: "Test", employees: 50, publicSlug: MARKER } });
    companyId = company.id;
    adminId = (
      await prisma.user.create({
        data: { email: `${MARKER}@hireiq.test`, name: "Synthetic admin", role: PortalRole.ADMIN, passwordHash: KEEP ? await hashPassword("Screening-demo-2026") : "not-a-login", emailVerifiedAt: new Date(), companyId },
      })
    ).id;
    const job = await prisma.job.create({ data: { title: `${MARKER} Backend engineer`, status: JobStatus.OPEN, companyId } });
    const spec = await prisma.jobSpecificationVersion.create({ data: { jobId: job.id, versionNumber: 1, status: "PUBLISHED", publishedAt: new Date(), title: job.title } });
    const assessment = await prisma.generatedAssessment.create({
      data: {
        jobId: job.id,
        companyId,
        version: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
        timeLimitMinutes: 20,
        drawCount: 8,
        items: generateAssessmentFromRubric({ requirements: ["SQL", "APIs", "Testing", "Debugging", "Data modelling", "Communication"], rubric: [] }),
      },
    });
    const parsedItems = parseAssessmentItems(assessment.items);
    if (!parsedItems.success) throw new Error("assessment items invalid");
    const itemById = new Map(parsedItems.data.map((item) => [item.id, item]));
    const values: Record<string, unknown> = { ...DEFAULT_SCREENING_POLICY };
    delete values.id;
    delete values.version;
    const policy = await saveScreeningPolicy({
      jobId: job.id,
      companyId,
      actorUserId: adminId,
      values: { ...values, basicPassPercent: 60, practicalPassPercent: 60, practicalTitle: "Data importer", practicalInstructions: "Build a small CSV importer." },
    });
    expect(policy.ok).toBe(true);

    type Person = { applicationId: number; candidateId: number; ability: number; optOut: boolean; knockout: boolean; humanReview: boolean; supported: number };
    const people: Person[] = [];
    const candidates = await prisma.candidate.createManyAndReturn({
      data: Array.from({ length: APPLICANTS }, (_, index) => ({ name: `Synthetic ${index}`, role: "Engineer", experienceYears: 1 + (index % 12), status: CandidateStatus.APPLIED, companyId })),
      select: { id: true },
    });
    const applications = await prisma.application.createManyAndReturn({
      data: candidates.map((candidate) => ({ candidateId: candidate.id, jobId: job.id, companyId })),
      select: { id: true, candidateId: true },
    });
    for (const application of applications) {
      const ability = random();
      people.push({
        applicationId: application.id,
        candidateId: application.candidateId,
        ability,
        optOut: random() < 0.03,
        knockout: random() < 0.06,
        humanReview: random() < 0.01,
        supported: Math.min(5, Math.max(0, Math.round(ability * 5 + (random() - 0.5) * 2))),
      });
    }
    await prisma.application.updateMany({ where: { id: { in: people.filter((p) => p.optOut).map((p) => p.applicationId) } }, data: { aiEvaluationOptOut: true } });
    await prisma.application.updateMany({ where: { id: { in: people.filter((p) => p.knockout).map((p) => p.applicationId) } }, data: { knockoutFailedAt: new Date() } });
    await prisma.application.updateMany({ where: { id: { in: people.filter((p) => p.humanReview).map((p) => p.applicationId) } }, data: { humanReviewRequestedAt: new Date() } });

    const analysed = people.filter((p) => !p.optOut);
    const evidence = await prisma.candidateEvidence.createManyAndReturn({
      data: analysed.map((p) => ({ companyId, candidateId: p.candidateId, applicationId: p.applicationId, sourceType: "RESUME_DOCUMENT" as const, origin: "CANDIDATE_PROVIDED" as const, inlineText: "Synthetic resume." })),
      select: { id: true, candidateId: true },
    });
    const runs = await prisma.candidateIntelligenceRun.createManyAndReturn({
      data: evidence.map((row) => ({ companyId, candidateId: row.candidateId, evidenceId: row.id, status: "COMPLETED" as const, extractorType: "DETERMINISTIC_TEXT_V1" as const, extractorVersion: "v1", modelProvider: "none", modelName: "none", promptVersion: "none", completedAt: new Date() })),
      select: { id: true, candidateId: true, evidenceId: true },
    });
    await prisma.candidateClaim.createMany({
      data: runs.map((run) => ({ companyId, candidateId: run.candidateId, runId: run.id, evidenceId: run.evidenceId, claimType: "SKILL" as const, value: "SQL" })),
    });
    const matchRuns = await prisma.candidateMatchRun.createManyAndReturn({
      data: analysed.map((p) => ({
        companyId,
        applicationId: p.applicationId,
        candidateId: p.candidateId,
        jobId: job.id,
        jobSpecificationVersionId: spec.id,
        status: "COMPLETED" as const,
        matcherVersion: "synthetic",
        requirementParseVersion: "synthetic",
        aliasMapVersion: "synthetic",
        intelligenceSnapshotHash: `${p.applicationId}`,
        completedAt: new Date(),
      })),
      select: { id: true, applicationId: true },
    });
    const supportedBy = new Map(analysed.map((p) => [p.applicationId, p.supported]));
    await prisma.requirementMatch.createMany({
      data: matchRuns.flatMap((run) =>
        Array.from({ length: 5 }, (_, at) => ({
          companyId,
          runId: run.id,
          requirementKey: `req-${at}`,
          sourceField: "primarySkills",
          category: "SKILL" as const,
          result: at < (supportedBy.get(run.applicationId) ?? 0) ? ("SATISFIED" as const) : ("UNKNOWN" as const),
          reasonCode: "SYNTHETIC",
        })),
      ),
    });

    const invited = people.filter((p) => !p.knockout);
    const basicStarted: Person[] = [];
    const basicSubmitted: Person[] = [];
    let duplicateSetWarnings = 0;
    await inBatches(invited, 10, async (p) => {
      const link = await sendAssessmentLink({ applicationId: p.applicationId, actorUserId: adminId, companyId });
      if (!link.uniqueSet) duplicateSetWarnings += 1;
      if (random() >= 0.88) return;
      await startGeneratedAssessment(link.rawToken);
      basicStarted.push(p);
      if (random() >= 0.92) return;
      const invite = await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: link.inviteId }, select: { itemOrder: true } });
      const answers: Record<string, string> = {};
      for (const id of invite.itemOrder as string[]) {
        const item = itemById.get(id)!;
        if (item.type === "multiple_choice") answers[id] = random() < 0.25 + p.ability * 0.7 ? String(item.correctIndex) : "1";
        else answers[id] = `My answer, quality ${Math.min(5, Math.max(1, Math.round(1 + p.ability * 4 + (random() - 0.5))))}. I would check the query plan first.`;
      }
      await saveAssessmentProgress(link.rawToken, answers, { tabSwitches: Math.floor(random() * 3), pastes: Math.floor(random() * 2) });
      await submitGeneratedAssessment(link.rawToken, null);
      basicSubmitted.push(p);
    });

    const afterBasic = await loadScreeningPool(job.id, companyId);
    const basicPassed = afterBasic!.rows.filter((row) => (row.evaluation.components.basic.percent ?? 0) >= 60 && row.evaluation.category !== "NOT_MET");
    const practicalSubmitted: number[] = [];
    await inBatches(basicPassed, 10, async (row) => {
      const assigned = await assignPractical({ applicationId: row.applicationId, companyId, actorUserId: adminId });
      if (random() >= 0.8) return;
      await submitPractical(assigned.url.split("/practical/")[1]!, { text: PRACTICAL(row.applicationId) });
      const ability = people.find((p) => p.applicationId === row.applicationId)!.ability;
      await recordPracticalScores({
        codingTestId: assigned.codingTestId,
        companyId,
        actorUserId: adminId,
        scores: ["correctness", "quality", "testing", "reasoning"].map((criterionKey) => ({ criterionKey, points: Math.min(5, Math.max(0, Math.round(ability * 5 + (random() - 0.5) * 2))) })),
      });
      practicalSubmitted.push(row.applicationId);
    });

    const rejectedBeforeApproval = await prisma.application.count({ where: { companyId, status: ApplicationPipelineStatus.REJECTED } });
    const pool = await loadScreeningPool(job.id, companyId);
    const counts = pool!.summary.categoryCounts;
    const topRows = pool!.rows.filter((row) => row.evaluation.category === "TOP");
    const optedOutIds = new Set(people.filter((p) => p.optOut).map((p) => p.applicationId));
    const optedOutAiRuns = await prisma.aIRun.count({ where: { companyId, entityType: "GeneratedAssessmentInvite", entityId: { in: (await prisma.generatedAssessmentInvite.findMany({ where: { applicationId: { in: [...optedOutIds] } }, select: { id: true } })).map((row) => row.id) } } });

    const proposal = await proposeCloseOut({ jobId: job.id, companyId, actorUserId: adminId, reason: "Missing required skill", category: "NOT_MET" });
    if (!proposal.ok) throw new Error(proposal.error);
    const rejectedAfterProposal = await prisma.application.count({ where: { companyId, status: ApplicationPipelineStatus.REJECTED } });
    const approval = await approveCloseOut({ batchId: proposal.id, companyId, actorUserId: adminId, confirmCount: proposal.count });
    if (!approval.ok) throw new Error(approval.error);
    const rejectedAfterApproval = await prisma.application.count({ where: { companyId, status: ApplicationPipelineStatus.REJECTED } });
    const spot = await ensureWeeklySpotCheck({ jobId: job.id, companyId });
    const funnel = await loadScreeningFunnel(job.id, companyId, 30);
    const invites = await prisma.generatedAssessmentInvite.findMany({ where: { assessment: { jobId: job.id } }, select: { itemOrder: true } });
    const distinctSets = new Set(invites.map((row) => [...(row.itemOrder as string[])].sort().join(","))).size;

    const report = {
      generatedAt: new Date().toISOString(),
      database: "local (DATABASE_URL on localhost); synthetic company deleted after the run",
      seed: 20261019,
      applicants: APPLICANTS,
      weights: `${DEFAULT_SCREENING_POLICY.basicWeight}/${DEFAULT_SCREENING_POLICY.practicalWeight}/${DEFAULT_SCREENING_POLICY.evidenceWeight}`,
      seeded: {
        mustHaveFailures: people.filter((p) => p.knockout).length,
        aiOptOuts: optedOutIds.size,
        humanReviewRequests: people.filter((p) => p.humanReview).length,
      },
      basicAssessment: { invited: invited.length, started: basicStarted.length, submitted: basicSubmitted.length, distinctQuestionSets: distinctSets, duplicateSetWarnings },
      practical: { assigned: basicPassed.length, submittedAndHumanGraded: practicalSubmitted.length },
      categoryCounts: counts,
      topApplicantsShown: topRows.length,
      summary: { ...pool!.summary, total: pool!.rows.length },
      mockedAiGradingCalls: aiCalls,
      aiRunsForOptedOutCandidates: optedOutAiRuns,
      rejectedBeforeAnyApproval: rejectedBeforeApproval,
      rejectedAfterProposalOnly: rejectedAfterProposal,
      closeOut: { proposed: proposal.count, skippedHumanReviewAtProposal: proposal.skippedHumanReview, closed: approval.closed.length, skippedAtApproval: approval.skipped.length },
      rejectedAfterApproval,
      spotCheck: spot,
      funnel: { steps: funnel.steps.map((step) => ({ step: step.label, count: step.count, rate: step.rate, dropOff: step.dropOff })), medians: funnel.medians, timeSaved: funnel.timeSaved },
      durationSeconds: Math.round((Date.now() - started) / 1000),
    };
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/screening-500.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));

    expect(pool!.rows).toHaveLength(APPLICANTS);
    expect(Object.values(counts).reduce((sum, value) => sum + value, 0)).toBe(APPLICANTS);
    expect(topRows.length).toBeLessThanOrEqual(20);
    expect(counts.NOT_MET).toBeGreaterThanOrEqual(people.filter((p) => p.knockout).length);
    expect(topRows.every((row) => !optedOutIds.has(row.applicationId) || row.evaluation.components.evidence.percent === null)).toBe(true);
    expect(rejectedBeforeApproval).toBe(0);
    expect(rejectedAfterProposal).toBe(0);
    expect(rejectedAfterApproval).toBe(approval.closed.length);
    expect(optedOutAiRuns).toBe(0);
    expect(spot.created).toBeLessThanOrEqual(5);
  });
});

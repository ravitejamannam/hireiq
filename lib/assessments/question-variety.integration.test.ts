import "@/lib/evidence-graph/evidence-graph-test-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CandidateStatus, JobStatus, PortalRole } from "@prisma/client";
import {
  difficultyOf,
  difficultyTargets,
  generateAssessmentFromRubric,
  questionSetKey,
  type AssessmentItem,
} from "@/lib/assessments/generated-assessment";
import { sendAssessmentLink } from "@/lib/assessments/generated-assessment-service";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `variety-${process.pid}-${Date.now()}`;
const LARGE_RUN = process.env.SCREENING_E2E_500 === "1" && integrationDatabase.mode === "accept";
const ITEMS = generateAssessmentFromRubric({ requirements: ["SQL", "APIs", "Testing", "Debugging", "Data modelling", "Communication"], rubric: [] });

type Tenant = { companyId: number; adminId: number; jobId: number; assessmentId: number; applicationIds: number[] };

async function inBatches<T>(rows: T[], size: number, run: (row: T) => Promise<void>) {
  for (let index = 0; index < rows.length; index += size) {
    await Promise.all(rows.slice(index, index + size).map(run));
  }
}

describe.skipIf(integrationDatabase.mode === "skip")("question-set variety through sendAssessmentLink", () => {
  const tenants: Tenant[] = [];
  const saved = { openai: process.env.OPENAI_API_KEY, resend: process.env.RESEND_API_KEY };

  async function tenant(label: string, items: AssessmentItem[], applicants: number): Promise<Tenant> {
    const company = await prisma.company.create({
      data: { name: `${MARKER} ${label}`, industry: "Test", employees: 5, publicSlug: `${MARKER}-${label}`.toLowerCase() },
    });
    const admin = await prisma.user.create({
      data: { email: `${MARKER}-${label}@hireiq.test`.toLowerCase(), name: `${label} admin`, role: PortalRole.ADMIN, passwordHash: "not-a-login", emailVerifiedAt: new Date(), companyId: company.id },
    });
    const job = await prisma.job.create({ data: { title: `${MARKER} ${label} role`, status: JobStatus.OPEN, companyId: company.id } });
    const assessment = await prisma.generatedAssessment.create({
      data: { jobId: job.id, companyId: company.id, version: 1, status: "PUBLISHED", publishedAt: new Date(), timeLimitMinutes: 20, drawCount: 8, items },
    });
    const applicationIds: number[] = [];
    await inBatches(Array.from({ length: applicants }, (_, index) => index), 25, async (index) => {
      const candidate = await prisma.candidate.create({
        data: { name: `${label} candidate ${index}`, role: "Engineer", experienceYears: 3, status: CandidateStatus.APPLIED, companyId: company.id },
      });
      applicationIds.push((await prisma.application.create({ data: { candidateId: candidate.id, jobId: job.id, companyId: company.id } })).id);
    });
    const row = { companyId: company.id, adminId: admin.id, jobId: job.id, assessmentId: assessment.id, applicationIds };
    tenants.push(row);
    return row;
  }

  async function sendAll(row: Tenant, concurrency: number) {
    const flags: boolean[] = [];
    await inBatches(row.applicationIds, concurrency, async (applicationId) => {
      const link = await sendAssessmentLink({ applicationId, actorUserId: row.adminId, companyId: row.companyId });
      flags.push(link.uniqueSet);
    });
    const invites = await prisma.generatedAssessmentInvite.findMany({ where: { assessmentId: row.assessmentId }, select: { itemOrder: true } });
    const uses = new Map<string, number>();
    let repeats = 0;
    for (const invite of invites) {
      const key = questionSetKey((invite.itemOrder as string[]).map(String));
      if (uses.has(key)) repeats += 1;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
    return {
      invites: invites.length,
      distinct: uses.size,
      repeats,
      flagged: flags.filter((flag) => !flag).length,
      maxUsesOfOneSet: Math.max(...uses.values()),
      orders: invites.map((invite) => invite.itemOrder as string[]),
    };
  }

  beforeAll(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.RESEND_API_KEY;
  });

  afterAll(async () => {
    process.env.OPENAI_API_KEY = saved.openai;
    process.env.RESEND_API_KEY = saved.resend;
    for (const row of tenants) {
      const where = { companyId: row.companyId };
      await prisma.stageReminder.deleteMany({ where });
      await prisma.generatedAssessmentInvite.deleteMany({ where: { assessment: where } });
      await prisma.generatedAssessment.deleteMany({ where });
      await deleteAuditLogsForTests(where);
      await prisma.application.deleteMany({ where });
      await prisma.candidate.deleteMany({ where });
      await prisma.job.deleteMany({ where });
      await prisma.user.deleteMany({ where });
      await prisma.company.deleteMany({ where: { id: row.companyId } });
    }
  });

  it("gives 60 concurrent invites 60 different balanced sets that hold only question ids", async () => {
    const row = await tenant("concurrent", ITEMS, 60);
    const result = await sendAll(row, 20);
    expect(result).toMatchObject({ invites: 60, distinct: 60, repeats: 0, flagged: 0 });
    const byId = new Map(ITEMS.map((item) => [item.id, item]));
    for (const order of result.orders) {
      expect(order.every((id) => typeof id === "string" && byId.has(id))).toBe(true);
      const counts = { easy: 0, medium: 0, hard: 0 };
      for (const id of order) counts[difficultyOf(byId.get(id)!)] += 1;
      expect(counts).toEqual(difficultyTargets(8));
    }
  });

  it("flags and spreads repeats once a small pool runs out, and audits each repeat", async () => {
    const row = await tenant("small", ITEMS.slice(0, 12), 100);
    const result = await sendAll(row, 10);
    expect(result.distinct).toBe(90);
    expect(result.repeats).toBe(10);
    expect(result.flagged).toBe(10);
    expect(result.maxUsesOfOneSet).toBe(2);
    const audited = await prisma.auditLog.count({
      where: { companyId: row.companyId, action: "ASSESSMENT_SENT", reason: { contains: "question set repeats" } },
    });
    expect(audited).toBe(10);
  });

  it("refuses to send another company's application", async () => {
    const [first, second] = tenants;
    await expect(
      sendAssessmentLink({ applicationId: second!.applicationIds[0]!, actorUserId: first!.adminId, companyId: first!.companyId }),
    ).rejects.toThrow("Application not found.");
  });

  it.skipIf(!LARGE_RUN)("issues 1,000 invites without a repeated set (local database only)", { timeout: 10 * 60 * 1000 }, async () => {
    const row = await tenant("thousand", ITEMS, 1000);
    const result = await sendAll(row, 10);
    const report = { pool: ITEMS.length, invites: result.invites, distinct: result.distinct, repeats: result.repeats, flagged: result.flagged, maxUsesOfOneSet: result.maxUsesOfOneSet };
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/question-variety-1000.json", `${JSON.stringify(report, null, 2)}\n`);
    expect(report).toMatchObject({ invites: 1000, distinct: 1000, repeats: 0, flagged: 0 });
  });
});

import "@/lib/evidence-graph/evidence-graph-test-env";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationPipelineStatus, PortalRole } from "@prisma/client";
import { submitRubricScorecard } from "@/app/actions/evaluation-actions";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { visibleScorecards } from "@/lib/interviews/slot-calculation";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

// Switchable authenticated interviewer, so authorization failures can be exercised without a session.
const ctx = vi.hoisted(() => ({ userId: 0, interviewerId: 0 }));

vi.mock("@/lib/auth/authorization", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/authorization")>();
  return {
    ...original,
    requireInterviewerPortal: async () => ({
      id: ctx.userId,
      email: "scorecard-policy@hireiq.test",
      name: "Scorecard policy interviewer",
      role: PortalRole.INTERVIEWER,
      companyId: null,
      interviewerId: ctx.interviewerId,
      interviewer: { id: ctx.interviewerId, name: "Scorecard policy interviewer", category: "ENGINEERING" },
    }),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

// Lets a test fail the audit write, to prove the upsert and the audit row commit or roll back together.
const failure = vi.hoisted(() => ({ action: null as string | null }));
vi.mock("@/lib/audit/write-audit-log", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/audit/write-audit-log")>();
  return {
    ...original,
    writeAuditLog: async (...args: Parameters<typeof original.writeAuditLog>) => {
      if (failure.action && args[1].action === failure.action) throw new Error("audit unavailable");
      return original.writeAuditLog(...args);
    },
  };
});






const MARKER = `scorecardpolicy-${process.pid}-${Date.now()}`;
const TOKEN = "scorecard-policy-status-token";

type AppRow = { id: number };

describe.skipIf(integrationDatabase.mode === "skip")("scorecard eligibility and audit integrity", () => {
  let companyId = 0;
  let interviewerProfileA = 0;
  let interviewerProfileB = 0;
  let userAId = 0;
  let userBId = 0;
  const createdApps: number[] = [];
  const jobIds: number[] = [];
  const candidateIds: number[] = [];
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const interviewerIds: number[] = [];
  let active: AppRow;
  let hired: AppRow;
  let rejected: AppRow;
  let withdrawn: AppRow;
  let assignedToB: AppRow;
  let activeF: AppRow;
  let unassignedApp: AppRow;
  let foreignApp: AppRow;
  let foreignCompanyId = 0;

  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: MARKER, industry: "T", employees: 2, publicSlug: MARKER } });
    companyIds.push(company.id);
    companyId = company.id;
    const profileA = await prisma.interviewer.create({ data: { name: `${MARKER} A`, category: "ENGINEERING" } });
    interviewerIds.push(profileA.id);
    const profileB = await prisma.interviewer.create({ data: { name: `${MARKER} B`, category: "ENGINEERING" } });
    interviewerIds.push(profileB.id);
    interviewerProfileA = profileA.id;
    interviewerProfileB = profileB.id;
    const userA = await prisma.user.create({ data: { email: `${MARKER}-a@hireiq.test`, name: "A", role: PortalRole.INTERVIEWER, passwordHash: "x", emailVerifiedAt: new Date(), interviewerId: profileA.id } });
    userIds.push(userA.id);
    userAId = userA.id;
    const userB = await prisma.user.create({ data: { email: `${MARKER}-b@hireiq.test`, name: "B", role: PortalRole.INTERVIEWER, passwordHash: "x", emailVerifiedAt: new Date(), interviewerId: profileB.id } });
    userIds.push(userB.id);
    userBId = userB.id;
    const job = await prisma.job.create({ data: { title: MARKER, status: "OPEN", companyId: company.id, assignedInterviewerId: interviewerProfileA } });
    jobIds.push(job.id);

    const makeApp = async (status: ApplicationPipelineStatus, withdrawn = false) => {
      const candidate = await prisma.candidate.create({ data: { name: `${MARKER}-${status}-${Math.random()}`, role: "Eng", experienceYears: 1, status: "APPLIED", companyId: company.id } });
      candidateIds.push(candidate.id);
      // statusTokenHash is unique: every application gets its own token.
      const tokenHash = createHash("sha256").update(`${TOKEN}-${status}-${candidate.id}`).digest("hex");
      const row = await prisma.application.create({ data: { candidateId: candidate.id, jobId: job.id, companyId: company.id, status, statusTokenHash: tokenHash, withdrawnAt: withdrawn ? new Date() : null } });
      createdApps.push(row.id);
      return row;
    };
    active = await makeApp(ApplicationPipelineStatus.TECH_EVALUATION);
    hired = await makeApp(ApplicationPipelineStatus.HIRED);
    rejected = await makeApp(ApplicationPipelineStatus.REJECTED);
    withdrawn = await makeApp(ApplicationPipelineStatus.TECH_EVALUATION, true);
    assignedToB = await makeApp(ApplicationPipelineStatus.TECH_EVALUATION);
    // Its own job, assigned to interviewer B: the same company, a different assignment.
    const jobB = await prisma.job.create({ data: { title: `${MARKER}-B`, status: "OPEN", companyId: company.id, assignedInterviewerId: interviewerProfileB } });
    jobIds.push(jobB.id);
    await prisma.application.update({ where: { id: assignedToB.id }, data: { jobId: jobB.id } });
    activeF = await makeApp(ApplicationPipelineStatus.TECH_EVALUATION);
    // A job with no assignment at all.
    const jobNone = await prisma.job.create({ data: { title: `${MARKER}-none`, status: "OPEN", companyId: company.id } });
    jobIds.push(jobNone.id);
    unassignedApp = await makeApp(ApplicationPipelineStatus.TECH_EVALUATION);
    await prisma.application.update({ where: { id: unassignedApp.id }, data: { jobId: jobNone.id } });

    const foreign = await prisma.company.create({ data: { name: `${MARKER}-foreign`, industry: "T", employees: 2, publicSlug: `${MARKER}-foreign` } });
    companyIds.push(foreign.id);
    foreignCompanyId = foreign.id;
    const fCandidate = await prisma.candidate.create({ data: { name: `${MARKER}-foreign`, role: "Eng", experienceYears: 1, status: "APPLIED", companyId: foreign.id } });
    candidateIds.push(fCandidate.id);
    const fJob = await prisma.job.create({ data: { title: `${MARKER}-foreign`, status: "OPEN", companyId: foreign.id, assignedInterviewerId: interviewerProfileB } });
    jobIds.push(fJob.id);
    const fApp = await prisma.application.create({ data: { candidateId: fCandidate.id, jobId: fJob.id, companyId: foreign.id, status: ApplicationPipelineStatus.TECH_EVALUATION } });
    createdApps.push(fApp.id);
    foreignApp = fApp;
  });

  beforeEach(async () => {
    ctx.userId = userAId;
    ctx.interviewerId = interviewerProfileA;
    failure.action = null;
  });

  afterAll(async () => {
    const companies = companyIds.filter((id) => id > 0);
    const jobs = jobIds.filter((id) => id > 0);
    const candidates = candidateIds.filter((id) => id > 0);
    const applications = createdApps.filter((id) => id > 0);
    const users = userIds.filter((id) => id > 0);
    const interviewers = interviewerIds.filter((id) => id > 0);
    if (companies.length + jobs.length + candidates.length + applications.length + users.length + interviewers.length === 0) return;

    const failures: string[] = [];
    const attempt = async (step: string, run: () => Promise<unknown>) => {
      try {
        await run();
        return true;
      } catch (error) {
        failures.push(`${step}: ${error instanceof Error ? error.message : "cleanup failed"}`);
        return false;
      }
    };

    // Evaluations reference applications and interviewer profiles. Audit rows
    // reference companies and users. Those two deletes do not depend on each other.
    const evaluationsGone = applications.length === 0 || await attempt("evaluations", () =>
      prisma.evaluation.deleteMany({ where: { applicationId: { in: applications } } }));
    const auditsGone = companies.length === 0 || await attempt("audit logs", () =>
      deleteAuditLogsForTests({ companyId: { in: companies } }));

    let applicationsGone = applications.length === 0;
    if (evaluationsGone && applications.length > 0) {
      applicationsGone = await attempt("applications", () =>
        prisma.application.deleteMany({ where: { id: { in: applications } } }));
    }
    let candidatesGone = candidates.length === 0;
    if (applicationsGone && candidates.length > 0) {
      candidatesGone = await attempt("candidates", () =>
        prisma.candidate.deleteMany({ where: { id: { in: candidates } } }));
    }
    let jobsGone = jobs.length === 0;
    if (applicationsGone && jobs.length > 0) {
      jobsGone = await attempt("jobs", () =>
        prisma.job.deleteMany({ where: { id: { in: jobs } } }));
    }
    let usersGone = users.length === 0;
    if (auditsGone && users.length > 0) {
      usersGone = await attempt("users", () =>
        prisma.user.deleteMany({ where: { id: { in: users } } }));
    }
    if (evaluationsGone && jobsGone && usersGone && interviewers.length > 0) {
      await attempt("interviewers", () =>
        prisma.interviewer.deleteMany({ where: { id: { in: interviewers } } }));
    }
    if (auditsGone && applicationsGone && candidatesGone && jobsGone && companies.length > 0) {
      await attempt("companies", () =>
        prisma.company.deleteMany({ where: { id: { in: companies } } }));
    }
    if (failures.length > 0) {
      throw new Error(`Scorecard policy fixture cleanup failed.\n${failures.join("\n")}`);
    }
  });

  const scores = (value: number) => [{ criterion: "Technical", score: value }];
  const evalsFor = (applicationId: number) => prisma.evaluation.findMany({ where: { applicationId } });
  const audits = () => prisma.auditLog.findMany({ where: { companyId: { in: [companyId, foreignCompanyId] } }, orderBy: { id: "asc" } });

  it("A: a valid submission writes one evaluation and one INTERVIEWER audit event with no scorecard contents", async () => {
    await submitRubricScorecard({ applicationId: active.id, scores: scores(4), notes: "Strong fundamentals." });
    const evals = await evalsFor(active.id);
    expect(evals).toHaveLength(1);
    expect(evals[0]).toMatchObject({ interviewerId: interviewerProfileA, overallScore: 4, submittedAt: expect.anything() });
    const rows = await audits();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "SCORECARD_SUBMITTED", actorRole: "INTERVIEWER", actorUserId: userAId, companyId, targetType: "APPLICATION", targetId: active.id });
    expect(JSON.stringify(rows[0])).not.toContain("Strong fundamentals.");
    expect(JSON.stringify(rows[0])).not.toContain('"score"');
  });

  it("B: resubmission overwrites the scorecard and writes one more audit event", async () => {
    await submitRubricScorecard({ applicationId: active.id, scores: scores(2), notes: "Revised after discussion." });
    const evals = await evalsFor(active.id);
    expect(evals).toHaveLength(1);
    expect(evals[0]!.overallScore).toBe(2);
    expect((await audits()).filter((row) => row.targetId === active.id)).toHaveLength(2);
  });

  it.each([
    ["HIRED", () => hired],
    ["REJECTED", () => rejected],
    ["withdrawn", () => withdrawn],
  ])("%s application is refused with no writes", async (_name, app) => {
    const row = app();
    const before = JSON.stringify(await audits());
    await expect(submitRubricScorecard({ applicationId: row.id, scores: scores(3) })).rejects.toThrow(/no longer be submitted/);
    expect(await evalsFor(row.id)).toHaveLength(0);
    expect(JSON.stringify(await audits())).toBe(before);
  });

  it("F: an audit-write failure rolls back the upsert; the retry succeeds", async () => {
    const before = (await audits()).filter((row) => row.targetId === activeF.id).length;
    failure.action = "SCORECARD_SUBMITTED";
    await expect(submitRubricScorecard({ applicationId: activeF.id, scores: scores(5) })).rejects.toThrow("audit unavailable");
    expect(await evalsFor(activeF.id)).toHaveLength(0);
    expect((await audits()).filter((row) => row.targetId === activeF.id)).toHaveLength(before);
    failure.action = null;
    await submitRubricScorecard({ applicationId: activeF.id, scores: scores(5) });
    expect((await evalsFor(activeF.id))[0]!.overallScore).toBe(5);
    expect((await audits()).filter((row) => row.targetId === activeF.id)).toHaveLength(before + 1);
  });

  it("G: unassigned and foreign-company applications are refused with no writes", async () => {
    const before = JSON.stringify(await audits());
    ctx.interviewerId = interviewerProfileB;
    ctx.userId = userBId;
    // B is the assigned interviewer on assignedToB's job, but B is refused everywhere else.
    await expect(submitRubricScorecard({ applicationId: active.id, scores: scores(3) })).rejects.toThrow();
    await expect(submitRubricScorecard({ applicationId: unassignedApp.id, scores: scores(3) })).rejects.toThrow();
    ctx.interviewerId = interviewerProfileA;
    ctx.userId = userAId;
    await expect(submitRubricScorecard({ applicationId: foreignApp.id, scores: scores(3) })).rejects.toThrow();
    for (const app of [active, unassignedApp, foreignApp]) {
      if (app.id !== active.id) expect(await evalsFor(app.id)).toHaveLength(0);
    }
    expect(JSON.stringify(await audits())).toBe(before);
  });

  it("H: invalid scores are refused before any write", async () => {
    const before = JSON.stringify(await audits());
    const beforeEval = await evalsFor(active.id);
    await expect(submitRubricScorecard({ applicationId: active.id, scores: scores(9) })).rejects.toThrow(/1 to 5/);
    await expect(submitRubricScorecard({ applicationId: active.id, scores: [{ criterion: "Technical", score: 2.5 }] })).rejects.toThrow(/1 to 5/);
    const current = await evalsFor(active.id);
    expect(JSON.stringify(current)).toBe(JSON.stringify(beforeEval));
    expect(JSON.stringify(await audits())).toBe(before);
  });

  it("I: hidden-until-submit visibility is unchanged", async () => {
    // Interviewer B has a submitted card on the active application; A has submitted too (case F), so A sees B's.
    await prisma.evaluation.create({ data: { applicationId: active.id, interviewerId: interviewerProfileB, overallScore: 3, submittedAt: new Date() } });
    const cards = await prisma.evaluation.findMany({ where: { applicationId: active.id } });
    expect(visibleScorecards({ viewerInterviewerId: interviewerProfileA, cards }).map((c) => c.interviewerId).sort()).toEqual([interviewerProfileA, interviewerProfileB]);
    // An unsubmitted viewer sees only their own card.
    expect(visibleScorecards({ viewerInterviewerId: 999999, cards }).map((c) => c.interviewerId)).toEqual([]);
  });
});

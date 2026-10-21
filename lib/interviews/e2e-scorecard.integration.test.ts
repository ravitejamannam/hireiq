import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PortalRole } from "@prisma/client";
import { submitRubricScorecard } from "@/app/actions/evaluation-actions";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { visibleScorecards } from "@/lib/interviews/slot-calculation";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const actor = vi.hoisted(() => ({ id: "0" }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

const marker = `scorecard-${process.pid}-${Date.now()}`;
const owned = {
  companyIds: [] as number[],
  jobIds: [] as number[],
  candidateIds: [] as number[],
  userIds: [] as number[],
  interviewerIds: [] as number[],
  applicationIds: [] as number[],
};

describe.skipIf(integrationDatabase.mode === "skip")("hidden scorecards until this interviewer submits", () => {
  let companyId = 0;
  let viewerUserId = 0;
  let viewerProfileId = 0;
  let otherProfileId = 0;
  let applicationId = 0;

  beforeAll(async () => {
    const company = await prisma.company.create({
      data: { name: `${marker} co`, industry: "Software", employees: 2, publicSlug: marker.slice(0, 60) },
    });
    owned.companyIds.push(company.id);
    companyId = company.id;
    const viewer = await prisma.interviewer.create({ data: { name: `${marker} viewer`, category: "ENGINEERING" } });
    owned.interviewerIds.push(viewer.id);
    const other = await prisma.interviewer.create({ data: { name: `${marker} other`, category: "ENGINEERING" } });
    owned.interviewerIds.push(other.id);
    viewerProfileId = viewer.id;
    otherProfileId = other.id;
    const viewerUser = await prisma.user.create({
      data: {
        email: `${marker}-viewer@hireiq.test`,
        name: `${marker} viewer`,
        role: PortalRole.INTERVIEWER,
        passwordHash: "not-a-login",
        emailVerifiedAt: new Date(),
        interviewerId: viewer.id,
      },
    });
    owned.userIds.push(viewerUser.id);
    const otherUser = await prisma.user.create({
      data: {
        email: `${marker}-other@hireiq.test`,
        name: `${marker} other`,
        role: PortalRole.INTERVIEWER,
        passwordHash: "not-a-login",
        emailVerifiedAt: new Date(),
        interviewerId: other.id,
      },
    });
    owned.userIds.push(otherUser.id);
    viewerUserId = viewerUser.id;
    const job = await prisma.job.create({
      data: { title: `${marker} Backend Engineer`, status: "OPEN", companyId: company.id, assignedInterviewerId: viewer.id },
    });
    owned.jobIds.push(job.id);
    const candidate = await prisma.candidate.create({
      data: { name: `${marker} applicant`, role: "Engineer", experienceYears: 3, status: "APPLIED", companyId: company.id },
    });
    owned.candidateIds.push(candidate.id);
    const application = await prisma.application.create({
      data: { candidateId: candidate.id, jobId: job.id, companyId: company.id, status: "CV_POOL" },
    });
    owned.applicationIds.push(application.id);
    applicationId = application.id;
    await prisma.evaluation.create({
      data: {
        applicationId: application.id,
        interviewerId: other.id,
        overallScore: 5,
        notes: "Other interviewer notes",
        submittedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    const companyIds = owned.companyIds.filter((id) => id > 0);
    const jobIds = owned.jobIds.filter((id) => id > 0);
    const candidateIds = owned.candidateIds.filter((id) => id > 0);
    const applicationIds = owned.applicationIds.filter((id) => id > 0);
    const userIds = owned.userIds.filter((id) => id > 0);
    const interviewerIds = owned.interviewerIds.filter((id) => id > 0);
    if (companyIds.length + jobIds.length + candidateIds.length + applicationIds.length + userIds.length + interviewerIds.length === 0) return;

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

    // Evaluations and audit rows do not reference each other. Later deletes wait
    // for the parent row that actually blocks them.
    const evaluationsGone = applicationIds.length === 0 || await attempt("evaluations", () =>
      prisma.evaluation.deleteMany({ where: { applicationId: { in: applicationIds } } }));
    const auditsGone = companyIds.length === 0 || await attempt("audit logs", () =>
      deleteAuditLogsForTests({ companyId: { in: companyIds } }));

    let applicationsGone = applicationIds.length === 0;
    if (evaluationsGone && applicationIds.length > 0) {
      applicationsGone = await attempt("applications", () =>
        prisma.application.deleteMany({ where: { id: { in: applicationIds } } }));
    }
    let candidatesGone = candidateIds.length === 0;
    if (applicationsGone && candidateIds.length > 0) {
      candidatesGone = await attempt("candidates", () =>
        prisma.candidate.deleteMany({ where: { id: { in: candidateIds } } }));
    }
    let jobsGone = jobIds.length === 0;
    if (applicationsGone && jobIds.length > 0) {
      jobsGone = await attempt("jobs", () =>
        prisma.job.deleteMany({ where: { id: { in: jobIds } } }));
    }
    let usersGone = userIds.length === 0;
    if (auditsGone && userIds.length > 0) {
      usersGone = await attempt("users", () =>
        prisma.user.deleteMany({ where: { id: { in: userIds } } }));
    }
    if (evaluationsGone && jobsGone && usersGone && interviewerIds.length > 0) {
      await attempt("interviewers", () =>
        prisma.interviewer.deleteMany({ where: { id: { in: interviewerIds } } }));
    }
    if (auditsGone && applicationsGone && candidatesGone && jobsGone && companyIds.length > 0) {
      await attempt("companies", () =>
        prisma.company.deleteMany({ where: { id: { in: companyIds } } }));
    }
    if (failures.length > 0) {
      throw new Error(`Scorecard fixture cleanup failed.\n${failures.join("\n")}`);
    }
  });

  it("hides the other scorecard until this interviewer submits", async () => {
    const before = await prisma.evaluation.findMany({
      where: { applicationId },
      select: { interviewerId: true, submittedAt: true, notes: true },
    });
    const hidden = visibleScorecards({ viewerInterviewerId: viewerProfileId, cards: before });
    expect(hidden.map((card) => card.notes)).toEqual([]);

    actor.id = String(viewerUserId);
    await submitRubricScorecard({
      applicationId,
      scores: [{ criterion: "Overall", score: 4 }],
      notes: "Clear on the Kubernetes tradeoff.",
    });

    const after = await prisma.evaluation.findMany({
      where: { applicationId },
      select: { interviewerId: true, submittedAt: true, notes: true, overallScore: true, scorecard: true },
    });
    const visible = visibleScorecards({ viewerInterviewerId: viewerProfileId, cards: after });
    expect(visible.map((card) => card.notes).sort()).toEqual(["Clear on the Kubernetes tradeoff.", "Other interviewer notes"]);
    expect(after.find((card) => card.interviewerId === viewerProfileId)).toMatchObject({
      overallScore: 4,
      notes: "Clear on the Kubernetes tradeoff.",
      scorecard: [{ criterion: "Overall", score: 4 }],
    });
    expect(after.find((card) => card.interviewerId === viewerProfileId)?.submittedAt).not.toBeNull();
    expect(after.find((card) => card.interviewerId === otherProfileId)?.notes).toBe("Other interviewer notes");

    const audits = await prisma.auditLog.findMany({
      where: { companyId, targetType: "APPLICATION", targetId: applicationId, action: "SCORECARD_SUBMITTED" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorUserId: viewerUserId,
      actorRole: "INTERVIEWER",
      companyId,
      targetType: "APPLICATION",
      targetId: applicationId,
      reason: null,
    });
  });
});

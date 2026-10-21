import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ApplicationPipelineStatus, PortalRole } from "@prisma/client";
import { applyReviewDecision } from "@/lib/review/review-queue-service";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `hrack-${process.pid}-${Date.now()}`;

/**
 * applyReviewDecision already re-verifies company ownership and stage transitions inside its transaction;
 * these fixtures exercise the human-review acknowledgement rule around that, with a second company proving
 * a cross-tenant application is simply not reachable.
 */
describe.skipIf(integrationDatabase.mode === "skip")("human-review acknowledgement on individual decisions", () => {
  let companyId = 0;
  let otherCompanyId = 0;
  let adminId = 0;
  let jobId = 0;
  let plain = 0;
  let flagged = 0;
  let flaggedForeign = 0;
  const createdApps: number[] = [];

  async function makeApp(companyIdArg: number, status: ApplicationPipelineStatus, withRequest = false) {
    const candidate = await prisma.candidate.create({ data: { name: `${MARKER}-${Math.random()}`, role: "Eng", experienceYears: 1, status: "APPLIED", companyId: companyIdArg } });
    const row = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId,
        companyId: companyIdArg,
        status,
        humanReviewRequestedAt: withRequest ? new Date("2026-10-20T09:00:00.000Z") : null,
      },
    });
    createdApps.push(row.id);
    return row;
  }

  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: MARKER, industry: "T", employees: 2, publicSlug: MARKER } });
    companyId = company.id;
    const admin = await prisma.user.create({ data: { email: `${MARKER}-admin@hireiq.test`, name: "admin", role: PortalRole.ADMIN, passwordHash: "x", emailVerifiedAt: new Date(), companyId: company.id } });
    adminId = admin.id;
    const job = await prisma.job.create({ data: { title: MARKER, status: "OPEN", companyId: company.id } });
    jobId = job.id;
    plain = (await makeApp(companyId, ApplicationPipelineStatus.CV_POOL)).id;
    flagged = (await makeApp(companyId, ApplicationPipelineStatus.CV_POOL, true)).id;

    const other = await prisma.company.create({ data: { name: `${MARKER}-other`, industry: "T", employees: 2, publicSlug: `${MARKER}-other` } });
    otherCompanyId = other.id;
    const otherJob = await prisma.job.create({ data: { title: `${MARKER}-other`, status: "OPEN", companyId: other.id } });
    const otherCandidate = await prisma.candidate.create({ data: { name: `${MARKER}-other`, role: "Eng", experienceYears: 1, status: "APPLIED", companyId: other.id } });
    const otherApp = await prisma.application.create({ data: { candidateId: otherCandidate.id, jobId: otherJob.id, companyId: other.id, status: ApplicationPipelineStatus.CV_POOL, humanReviewRequestedAt: new Date("2026-10-20T09:00:00.000Z") } });
    createdApps.push(otherApp.id);
    flaggedForeign = otherApp.id;
  });

  beforeEach(async () => {
    await deleteAuditLogsForTests({ companyId: { in: [companyId, otherCompanyId] } });
    await prisma.decisionRecord.deleteMany({ where: { applicationId: { in: createdApps } } });
    await prisma.outcomeEvent.deleteMany({ where: { applicationId: { in: createdApps } } });
    await prisma.application.updateMany({ where: { id: { in: createdApps } }, data: { status: ApplicationPipelineStatus.CV_POOL } });
  });

  afterAll(async () => {
    await deleteAuditLogsForTests({ companyId: { in: [companyId, otherCompanyId] } });
    await prisma.decisionRecord.deleteMany({ where: { applicationId: { in: createdApps } } });
    await prisma.outcomeEvent.deleteMany({ where: { applicationId: { in: createdApps } } });
    await prisma.application.deleteMany({ where: { id: { in: createdApps } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
    await prisma.job.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  });

  const requestState = (applicationId: number) =>
    prisma.application.findUniqueOrThrow({ where: { id: applicationId }, select: { humanReviewRequestedAt: true, status: true } });
  const decisions = (applicationId: number) => prisma.decisionRecord.findMany({ where: { applicationId }, orderBy: { id: "asc" } });

  it("no outstanding request: the decision behaves exactly as before (no acknowledgement recorded)", async () => {
    const result = await applyReviewDecision({ applicationId: plain, actorUserId: adminId, action: "advance", humanReviewAcknowledged: false });
    expect(result.status).toBe(ApplicationPipelineStatus.EXPERT_REVIEW);
    const rows = await decisions(plain);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rationale).not.toContain("human-review-acknowledged");
    expect((await requestState(plain)).humanReviewRequestedAt).toBeNull();
  });

  it("outstanding request without acknowledgement: refused, nothing written", async () => {
    const before = await requestState(flagged);
    await expect(
      applyReviewDecision({ applicationId: flagged, actorUserId: adminId, action: "advance" }),
    ).rejects.toThrow(/human to review/i);
    await expect(
      applyReviewDecision({ applicationId: flagged, actorUserId: adminId, action: "reject", reason: "OTHER" }),
    ).rejects.toThrow(/human to review|rejection reason/i);
    // A note is not acknowledgement either.
    await expect(
      applyReviewDecision({ applicationId: flagged, actorUserId: adminId, action: "advance", note: "looks fine to me" }),
    ).rejects.toThrow(/human to review/i);
    expect(await requestState(flagged)).toEqual(before);
    expect(await decisions(flagged)).toHaveLength(0);
    expect(await prisma.auditLog.count({ where: { targetType: "APPLICATION", targetId: flagged } })).toBe(0);
    expect(await prisma.outcomeEvent.count({ where: { applicationId: flagged } })).toBe(0);
  });

  it("outstanding request with explicit acknowledgement: decision succeeds and records the request timestamp", async () => {
    const result = await applyReviewDecision({
      applicationId: flagged,
      actorUserId: adminId,
      action: "advance",
      humanReviewAcknowledged: true,
    });
    expect(result.status).toBe(ApplicationPipelineStatus.EXPERT_REVIEW);
    const rows = await decisions(flagged);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rationale).toContain("human-review-acknowledged (requested 2026-10-20T09:00:00.000Z)");
    const audits = await prisma.auditLog.findMany({ where: { targetType: "APPLICATION", targetId: flagged }, orderBy: { id: "asc" } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "APPLICATION_STAGE_CHANGED", actorRole: "ADMIN", actorUserId: adminId, companyId });
    // The request itself is never cleared.
    expect((await requestState(flagged)).humanReviewRequestedAt).toEqual(new Date("2026-10-20T09:00:00.000Z"));
    // The next decision on the same application needs its own acknowledgement (fresh request or not:
    // the flag is never cleared, so every later decision acknowledges again).
    await applyReviewDecision({ applicationId: flagged, actorUserId: adminId, action: "advance", humanReviewAcknowledged: true });
    expect((await requestState(flagged)).status).toBe(ApplicationPipelineStatus.TECH_EVALUATION);
  });

  it("undo remains exempt from the acknowledgement requirement", async () => {
    // Undo replays only event-backed stages (shortlist/reject/hire), so reach SHORTLISTED first.
    await applyReviewDecision({ applicationId: flagged, actorUserId: adminId, action: "advance", humanReviewAcknowledged: true });
    await applyReviewDecision({ applicationId: flagged, actorUserId: adminId, action: "advance", humanReviewAcknowledged: true });
    await applyReviewDecision({ applicationId: flagged, actorUserId: adminId, action: "shortlist", humanReviewAcknowledged: true });
    const result = await applyReviewDecision({ applicationId: flagged, actorUserId: adminId, action: "undo", undoTo: ApplicationPipelineStatus.TECH_EVALUATION });
    expect(result.status).toBe(ApplicationPipelineStatus.TECH_EVALUATION);
    expect((await requestState(flagged)).humanReviewRequestedAt).toEqual(new Date("2026-10-20T09:00:00.000Z"));
    const rows = await decisions(flagged);
    expect(rows[rows.length - 1]!.rationale).not.toContain("human-review-acknowledged");
  });

  it("the acknowledgement logic binds to the application's own company, and cross-tenant refusal stays at the action layer", async () => {
    // Service-level contract: applyReviewDecision resolves the company from the application row (tenant
    // enforcement is assertReviewJob in the server action, already covered by the browser suite). The
    // acknowledgement must therefore carry the foreign application's own company, never the actor's.
    const result = await applyReviewDecision({ applicationId: flaggedForeign, actorUserId: adminId, action: "advance", humanReviewAcknowledged: true });
    expect(result.status).toBe(ApplicationPipelineStatus.EXPERT_REVIEW);
    const rows = await decisions(flaggedForeign);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.companyId).toBe(otherCompanyId);
    expect(rows[0]!.rationale).toContain("human-review-acknowledged");
    const audits = await prisma.auditLog.findMany({ where: { targetType: "APPLICATION", targetId: flaggedForeign } });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.companyId).toBe(otherCompanyId);
    expect(audits[0]!.companyId).not.toBe(companyId);
  });

  it("existing validation still runs: an invalid rejection reason and an impossible transition are refused even with acknowledgement", async () => {
    await expect(
      applyReviewDecision({ applicationId: flagged, actorUserId: adminId, action: "reject", reason: "not-a-reason", humanReviewAcknowledged: true }),
    ).rejects.toThrow(/rejection reason/i);
    await prisma.application.update({ where: { id: flagged }, data: { status: ApplicationPipelineStatus.HIRED } });
    await expect(
      applyReviewDecision({ applicationId: flagged, actorUserId: adminId, action: "advance", humanReviewAcknowledged: true }),
    ).rejects.toThrow();
    await prisma.application.update({ where: { id: flagged }, data: { status: ApplicationPipelineStatus.CV_POOL } });
  });
});

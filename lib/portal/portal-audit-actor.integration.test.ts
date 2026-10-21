import "@/lib/evidence-graph/evidence-graph-test-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CandidateStatus, JobStatus, PortalRole } from "@prisma/client";
import { POST as portalAct } from "@/app/portal/act/route";
import { optOutOfAiEvaluation, requestHumanReview } from "@/app/actions/candidate-portal-actions";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { rememberPortalIdentity } from "@/lib/portal/portal-service";
import { PORTAL_COOKIE, signPortalSession } from "@/lib/portal/portal-session";
import { prisma } from "@/lib/prisma";
import { cancelCloseOut } from "@/lib/screening/close-out-service";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const cookieState = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "hireiq_portal" && cookieState.value ? { name, value: cookieState.value } : undefined),
    set: () => undefined,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

// Lets a test make the audit write fail, to prove the action and its audit row commit or roll back together.
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









const MARKER = `portalactor-${process.pid}-${Date.now()}`;

type Tenant = { companyId: number; adminId: number; jobId: number; candidateId: number; applicationId: number; email: string; statusToken: string };

/**
 * A candidate's portal action must never be attributed to a user. Before the fix, auditActor() picked the lowest-id
 * ADMIN across every company, so the audit trail named an administrator who did nothing (and who could belong to
 * another tenant). The candidate is identified by the target (application or candidate) and the company is taken
 * from the validated application, so the actor column stays empty for CANDIDATE rows.
 */
describe.skipIf(integrationDatabase.mode === "skip")("candidate portal audit attribution", () => {
  let decoyAdminId = 0; // created first, so it is the lowest-id admin among this test's data
  let decoyCompanyId = 0;
  const tenants: Record<"a" | "b", Tenant> = {} as Record<"a" | "b", Tenant>;

  async function tenant(key: "a" | "b"): Promise<Tenant> {
    const company = await prisma.company.create({ data: { name: `${MARKER}-${key}`, industry: "T", employees: 2, publicSlug: `${MARKER}-${key}` } });
    const admin = await prisma.user.create({ data: { email: `${MARKER}-${key}-admin@hireiq.test`, name: `admin ${key}`, role: PortalRole.ADMIN, passwordHash: "x", emailVerifiedAt: new Date(), companyId: company.id } });
    const job = await prisma.job.create({ data: { title: `${MARKER}-${key}`, status: JobStatus.OPEN, companyId: company.id } });
    const candidate = await prisma.candidate.create({ data: { name: `${MARKER}-${key}`, role: "Eng", experienceYears: 1, status: CandidateStatus.APPLIED, companyId: company.id } });
    const statusToken = `${MARKER}-${key}-status-token`;
    const application = await prisma.application.create({
      data: { candidateId: candidate.id, jobId: job.id, companyId: company.id, aiPreference: "ALLOWED", statusTokenHash: createHash("sha256").update(statusToken, "utf8").digest("hex") },
    });
    const email = `${MARKER}-${key}@candidate.test`;
    await rememberPortalIdentity(email, candidate.id, company.id);
    return { companyId: company.id, adminId: admin.id, jobId: job.id, candidateId: candidate.id, applicationId: application.id, email, statusToken };
  }

  const companyIds = () => [decoyCompanyId, tenants.a.companyId, tenants.b.companyId];

  beforeAll(async () => {
    const decoyCompany = await prisma.company.create({ data: { name: `${MARKER}-decoy`, industry: "T", employees: 2, publicSlug: `${MARKER}-decoy` } });
    decoyCompanyId = decoyCompany.id;
    decoyAdminId = (await prisma.user.create({ data: { email: `${MARKER}-decoy-admin@hireiq.test`, name: "decoy", role: PortalRole.ADMIN, passwordHash: "x", emailVerifiedAt: new Date(), companyId: decoyCompanyId } })).id;
    tenants.a = await tenant("a");
    tenants.b = await tenant("b");
  });

  beforeEach(async () => {
    cookieState.value = undefined;
    failure.action = null;
    await prisma.application.updateMany({
      where: { id: { in: [tenants.a.applicationId, tenants.b.applicationId] } },
      data: { humanReviewRequestedAt: null, aiPreference: "ALLOWED", aiPreferenceSource: null, aiPreferenceAt: null, aiOptOutAt: null },
    });
    await deleteAuditLogsForTests({ companyId: { in: companyIds() } });
  });

  afterAll(async () => {
    const where = { companyId: { in: companyIds() } };
    await deleteAuditLogsForTests(where);
    await prisma.closeOutBatch.deleteMany({ where });
    await prisma.candidatePortalIdentity.deleteMany({ where });
    await prisma.application.deleteMany({ where });
    await prisma.candidate.deleteMany({ where });
    await prisma.job.deleteMany({ where });
    await prisma.user.deleteMany({ where: { companyId: { in: companyIds() } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds() } } });
  });

  const session = (email: string, expiresAt = new Date(Date.now() + 3_600_000)) => signPortalSession(email, expiresAt);

  async function humanReviewViaRoute(applicationId: number) {
    const body = new FormData();
    body.set("intent", "human-review");
    body.set("applicationId", String(applicationId));
    return portalAct(new Request("http://localhost:4001/portal/act", { method: "POST", body }));
  }

  const auditsFor = (applicationId: number) => prisma.auditLog.findMany({ where: { targetType: "APPLICATION", targetId: applicationId }, orderBy: { id: "asc" } });
  const flag = async (applicationId: number) => (await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, select: { humanReviewRequestedAt: true } })).humanReviewRequestedAt;
  const allAdminIds = async () => (await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })).map((row) => row.id);

  it("POST /portal/act human-review records a CANDIDATE event with no user actor, never the lowest-id admin", async () => {
    const a = tenants.a;
    cookieState.value = session(a.email);
    const response = await humanReviewViaRoute(a.applicationId);
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).pathname).toBe(`/portal/applications/${a.applicationId}`);

    expect(await flag(a.applicationId)).not.toBeNull();
    const rows = await auditsFor(a.applicationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "HUMAN_REVIEW_REQUESTED", actorRole: "CANDIDATE", companyId: a.companyId, targetType: "APPLICATION", targetId: a.applicationId, reason: "via candidate portal" });
    expect(rows[0]!.actorUserId).toBeNull();
    // Not the lowest-id admin, not this company's admin, not any admin at all.
    const lowestAdmin = Math.min(...(await allAdminIds()));
    expect(rows[0]!.actorUserId).not.toBe(lowestAdmin);
    expect(rows[0]!.actorUserId).not.toBe(decoyAdminId);
    expect(rows[0]!.actorUserId).not.toBe(a.adminId);
    // Nothing was written against any administrator for this action.
    expect(await prisma.auditLog.count({ where: { companyId: { in: companyIds() }, actorUserId: { not: null } } })).toBe(0);
  });

  it("a second candidate in another company is attributed independently, and no company's admin is named", async () => {
    const { a, b } = tenants;
    cookieState.value = session(a.email);
    await humanReviewViaRoute(a.applicationId);
    cookieState.value = session(b.email);
    await humanReviewViaRoute(b.applicationId);

    const [rowA] = await auditsFor(a.applicationId);
    const [rowB] = await auditsFor(b.applicationId);
    expect(rowA).toMatchObject({ companyId: a.companyId, targetId: a.applicationId, actorRole: "CANDIDATE", actorUserId: null });
    expect(rowB).toMatchObject({ companyId: b.companyId, targetId: b.applicationId, actorRole: "CANDIDATE", actorUserId: null });
    expect(rowA!.companyId).not.toBe(rowB!.companyId);
    // Tenant B's event is not attributed to tenant A's admin (the lowest id of the two), nor the other way round.
    expect([rowA!.actorUserId, rowB!.actorUserId]).not.toContain(a.adminId);
    expect([rowA!.actorUserId, rowB!.actorUserId]).not.toContain(b.adminId);
    expect(await prisma.auditLog.count({ where: { companyId: a.companyId, targetId: b.applicationId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { companyId: b.companyId, targetId: a.applicationId } })).toBe(0);
  });

  it("a candidate session for company A cannot act on company B's application and writes nothing", async () => {
    const { a, b } = tenants;
    cookieState.value = session(a.email);
    await humanReviewViaRoute(b.applicationId);
    expect(await flag(b.applicationId)).toBeNull();
    expect(await auditsFor(b.applicationId)).toHaveLength(0);
    expect(await prisma.auditLog.count({ where: { companyId: { in: companyIds() } } })).toBe(0);
  });

  it.each([
    ["no cookie", () => undefined],
    ["an expired session", () => session(tenants.a.email, new Date(Date.now() - 1000))],
    ["a session signed with another secret", () => signPortalSession(tenants.a.email, new Date(Date.now() + 3_600_000), "not-the-portal-secret")],
    ["a tampered session body", () => {
      const [, sig] = session(tenants.a.email).split(".");
      const forged = Buffer.from(JSON.stringify({ email: tenants.b.email, exp: new Date(Date.now() + 3_600_000).toISOString() }), "utf8").toString("base64url");
      return `${forged}.${sig}`;
    }],
  ])("POST /portal/act with %s is refused before any audit event or write", async (_name, make) => {
    cookieState.value = make();
    const response = await humanReviewViaRoute(tenants.a.applicationId);
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).pathname + new URL(response.headers.get("location")!).search).toBe("/portal?error=expired");
    expect(await flag(tenants.a.applicationId)).toBeNull();
    expect(await flag(tenants.b.applicationId)).toBeNull();
    expect(await prisma.auditLog.count({ where: { companyId: { in: companyIds() } } })).toBe(0);
  });

  const preference = (applicationId: number) =>
    prisma.application.findUniqueOrThrow({ where: { id: applicationId }, select: { aiPreference: true, aiPreferenceSource: true, aiOptOutAt: true } });
  const allAudits = () => prisma.auditLog.count({ where: { companyId: { in: companyIds() } } });

  it("status-page human review records one CANDIDATE_TOKEN event for that application and company, with no user", async () => {
    const { a, b } = tenants;
    await requestHumanReview(a.statusToken);
    expect(await flag(a.applicationId)).not.toBeNull();
    expect(await flag(b.applicationId)).toBeNull();
    const rows = await prisma.auditLog.findMany({ where: { companyId: { in: companyIds() } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "HUMAN_REVIEW_REQUESTED", actorRole: "CANDIDATE_TOKEN", companyId: a.companyId, targetType: "APPLICATION", targetId: a.applicationId, reason: "via candidate status page", scimTokenId: null });
    expect(rows[0]!.actorUserId).toBeNull();
    // The status token itself is never stored in the row.
    expect(JSON.stringify(rows[0])).not.toContain(a.statusToken);
  });

  it("status-page AI opt-out records one CANDIDATE_TOKEN event for that application and company, with no user", async () => {
    const { a, b } = tenants;
    await optOutOfAiEvaluation(a.statusToken);
    expect(await preference(a.applicationId)).toMatchObject({ aiPreference: "REFUSED", aiPreferenceSource: "STATUS_PAGE" });
    expect((await preference(a.applicationId)).aiOptOutAt).not.toBeNull();
    expect((await preference(b.applicationId)).aiPreference).toBe("ALLOWED");
    const rows = await prisma.auditLog.findMany({ where: { companyId: { in: companyIds() } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "AI_OPT_OUT", actorRole: "CANDIDATE_TOKEN", companyId: a.companyId, targetType: "APPLICATION", targetId: a.applicationId, reason: "via candidate status page" });
    expect(rows[0]!.actorUserId).toBeNull();
    expect(JSON.stringify(rows[0])).not.toContain(a.statusToken);
  });

  it.each([
    ["an unknown token", "not-a-real-status-token"],
    ["an empty token", ""],
    ["a well-formed but unissued token", "portalactor-unissued-status-token"],
  ])("%s changes nothing and writes no audit row", async (_name, token) => {
    await requestHumanReview(token);
    await optOutOfAiEvaluation(token);
    for (const key of ["a", "b"] as const) {
      expect(await flag(tenants[key].applicationId)).toBeNull();
      expect((await preference(tenants[key].applicationId)).aiPreference).toBe("ALLOWED");
    }
    expect(await allAudits()).toBe(0);
  });

  it("company A's token affects only company A's application, never company B's", async () => {
    const { a, b } = tenants;
    await requestHumanReview(a.statusToken);
    await optOutOfAiEvaluation(a.statusToken);
    expect(await flag(b.applicationId)).toBeNull();
    expect((await preference(b.applicationId)).aiPreference).toBe("ALLOWED");
    expect(await prisma.auditLog.count({ where: { companyId: b.companyId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { targetId: b.applicationId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { companyId: a.companyId } })).toBe(2);
  });

  it.each([
    ["HUMAN_REVIEW_REQUESTED", () => requestHumanReview(tenants.a.statusToken)],
    ["AI_OPT_OUT", () => optOutOfAiEvaluation(tenants.a.statusToken)],
  ])("a failed %s audit write rolls the change back and the error reaches the caller", async (action, run) => {
    failure.action = action;
    await expect(run()).rejects.toThrow("audit unavailable");
    expect(await flag(tenants.a.applicationId)).toBeNull();
    expect(await preference(tenants.a.applicationId)).toMatchObject({ aiPreference: "ALLOWED", aiPreferenceSource: null, aiOptOutAt: null });
    expect(await allAudits()).toBe(0);
    failure.action = null;
    await run();
    expect(await allAudits()).toBe(1);
  });

  it("the signed-in portal path still records role CANDIDATE, not CANDIDATE_TOKEN, exactly once", async () => {
    const a = tenants.a;
    cookieState.value = session(a.email);
    await humanReviewViaRoute(a.applicationId);
    const rows = await auditsFor(a.applicationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "HUMAN_REVIEW_REQUESTED", actorRole: "CANDIDATE", reason: "via candidate portal" });
  });

  it("admin attribution is unchanged: an admin action still records that admin and role ADMIN", async () => {
    const { a } = tenants;
    const batch = await prisma.closeOutBatch.create({
      data: { companyId: a.companyId, jobId: a.jobId, category: "SELECTED", reason: "Location mismatch", applicationIds: [a.applicationId], proposedByUserId: a.adminId },
    });
    expect(await cancelCloseOut({ batchId: batch.id, companyId: a.companyId, actorUserId: a.adminId })).toEqual({ ok: true });
    const rows = await prisma.auditLog.findMany({ where: { action: "CLOSE_OUT_CANCELLED", targetType: "CLOSE_OUT_BATCH", targetId: batch.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: a.adminId, actorRole: "ADMIN", companyId: a.companyId });
  });

  it("the database refuses a new CANDIDATE audit row that names a user", async () => {
    const { a } = tenants;
    await expect(
      prisma.auditLog.create({ data: { actorUserId: a.adminId, actorRole: "CANDIDATE", companyId: a.companyId, action: "HUMAN_REVIEW_REQUESTED", targetType: "APPLICATION", targetId: a.applicationId } }),
    ).rejects.toThrow();
    expect(await prisma.auditLog.count({ where: { companyId: a.companyId } })).toBe(0);
  });

  it("the portal service has no administrator lookup for audit rows", () => {
    const source = readFileSync("lib/portal/portal-service.ts", "utf8");
    expect(source).not.toMatch(/auditActor/);
    expect(source).not.toMatch(/role:\s*"ADMIN"/);
    expect(PORTAL_COOKIE).toBe("hireiq_portal");
  });
});

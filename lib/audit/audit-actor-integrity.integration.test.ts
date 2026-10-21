import "@/lib/evidence-graph/evidence-graph-test-env";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationPipelineStatus, CandidateStatus, CodingTestStatus, JobStatus, PortalRole } from "@prisma/client";
import { generateAssessmentFromRubric } from "@/lib/assessments/generated-assessment";
import { submitGeneratedAssessment } from "@/lib/assessments/generated-assessment-service";
import { assertAuditActor, deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { generateSecureToken, hashSecureToken } from "@/lib/auth/secure-token";
import { prisma } from "@/lib/prisma";
import type { ErasureDeps } from "@/lib/privacy/candidate-erasure";
import type { RetentionPolicyProvider } from "@/lib/privacy/retention-policy";
import { runRetention } from "@/lib/privacy/retention-worker";
import { cancelCloseOut } from "@/lib/screening/close-out-service";
import { submitPractical } from "@/lib/screening/practical-service";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const failure = vi.hoisted(() => ({ action: null as string | null }));

// Wraps the real writer so a test can make one action's audit write fail. Everything else passes straight through.
vi.mock("@/lib/audit/write-audit-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/write-audit-log")>();
  return {
    ...actual,
    writeAuditLog: async (db: Parameters<typeof actual.writeAuditLog>[0], input: Parameters<typeof actual.writeAuditLog>[1]) => {
      if (failure.action && input.action === failure.action) throw new Error("simulated audit persistence failure");
      return actual.writeAuditLog(db, input);
    },
  };
});












const MARKER = `auditactor-${process.pid}-${Date.now()}`;

type Tenant = {
  companyId: number;
  adminId: number;
  jobId: number;
  assessmentId: number;
};

describe.skipIf(integrationDatabase.mode === "skip")("audit actors are real: candidates, workers and the IdP never borrow an administrator's id", () => {
  let decoyAdminId = 0;
  let decoyCompanyId = 0;
  const tenants = {} as Record<"a" | "b", Tenant>;
  const companyIds: number[] = [];
  let itemIds: string[] = [];
  const ok: ErasureDeps = { deleteObject: async () => ({ status: "ABSENT" }) };

  async function company(label: string) {
    const row = await prisma.company.create({ data: { name: `${MARKER}-${label}`, industry: "T", employees: 2, publicSlug: `${MARKER}-${label}` } });
    companyIds.push(row.id);
    const admin = await prisma.user.create({
      data: { email: `${MARKER}-${label}-admin@hireiq.test`, name: `admin ${label}`, role: PortalRole.ADMIN, passwordHash: "x", emailVerifiedAt: new Date(), companyId: row.id },
    });
    return { companyId: row.id, adminId: admin.id };
  }

  async function tenant(label: string): Promise<Tenant> {
    const base = await company(label);
    const job = await prisma.job.create({ data: { title: `${MARKER}-${label}`, status: JobStatus.OPEN, companyId: base.companyId } });
    const items = generateAssessmentFromRubric({ requirements: ["SQL", "APIs", "Testing", "Debugging"], rubric: [] });
    itemIds = (items as Array<{ id: string }>).map((item) => item.id);
    const assessment = await prisma.generatedAssessment.create({ data: { jobId: job.id, companyId: base.companyId, version: 1, status: "PUBLISHED", publishedAt: new Date(), items } });
    return { ...base, jobId: job.id, assessmentId: assessment.id };
  }

  async function applicant(t: Tenant, label: string, status: ApplicationPipelineStatus = ApplicationPipelineStatus.CV_POOL) {
    const person = await prisma.candidate.create({ data: { name: `${label}-${MARKER}`, role: "Eng", experienceYears: 1, status: CandidateStatus.APPLIED, companyId: t.companyId } });
    const application = await prisma.application.create({ data: { candidateId: person.id, jobId: t.jobId, companyId: t.companyId, status, aiPreference: "ALLOWED" } });
    return { candidateId: person.id, applicationId: application.id };
  }

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

  async function invite(t: Tenant, applicationId: number) {
    const token = generateSecureToken();
    const row = await prisma.generatedAssessmentInvite.create({
      data: { applicationId, assessmentId: t.assessmentId, tokenHash: token.tokenHash, itemOrder: itemIds, answers: {}, startedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) },
    });
    return { token: token.rawToken, id: row.id };
  }

  const allAdminIds = async () => (await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })).map((row) => row.id);
  const audits = (where: object) => prisma.auditLog.findMany({ where: { companyId: { in: companyIds }, ...where }, orderBy: { id: "asc" } });

  beforeAll(async () => {
    process.env.HIREIQ_SKIP_RESUME_PARSE = "1";
    // Created first, so this admin has the lowest id of any admin this test creates.
    const decoy = await company("decoy");
    decoyAdminId = decoy.adminId;
    decoyCompanyId = decoy.companyId;
    tenants.a = await tenant("a");
    tenants.b = await tenant("b");
  });

  beforeEach(() => {
    failure.action = null;
  });

  afterAll(async () => {
    const where = { companyId: { in: companyIds } };
    await deleteAuditLogsForTests(where);
    await prisma.closeOutBatch.deleteMany({ where });
    await prisma.candidateErasure.deleteMany({ where });
    await prisma.generatedAssessmentInvite.deleteMany({ where: { assessment: where } });
    await prisma.generatedAssessment.deleteMany({ where });
    await prisma.codingTest.deleteMany({ where: { application: where } });
    await prisma.application.deleteMany({ where });
    await prisma.candidate.deleteMany({ where });
    await prisma.job.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  describe("the writer", () => {
    it("requires no user id for non-user actors and a real one for users", () => {
      for (const role of ["CANDIDATE", "CANDIDATE_TOKEN", "SYSTEM_RETENTION"]) {
        expect(() => assertAuditActor(role, null)).not.toThrow();
        expect(() => assertAuditActor(role, 7)).toThrow(/must not carry a user id/);
        expect(() => assertAuditActor(role, 0)).toThrow(/must not carry a user id/);
      }
      // SCIM is a non-user actor too, but it must name its credential (covered in the SCIM suite).
      expect(() => assertAuditActor("SCIM", null, 5)).not.toThrow();
      expect(() => assertAuditActor("SCIM", null)).toThrow(/SCIM credential/);
      expect(() => assertAuditActor("SCIM", 7, 5)).toThrow(/must not carry a user id/);
      expect(() => assertAuditActor("ADMIN", 7, 5)).toThrow(/must not carry a SCIM credential id/);
      for (const role of ["ADMIN", "OWNER", "INTERVIEWER", "API"]) {
        expect(() => assertAuditActor(role, 7)).not.toThrow();
        expect(() => assertAuditActor(role, null)).toThrow(/real user id/);
        expect(() => assertAuditActor(role, 0)).toThrow(/real user id/);
        expect(() => assertAuditActor(role, -1)).toThrow(/real user id/);
      }
    });

    it("no fallback to an arbitrary administrator remains in source", () => {
      for (const file of [
        "lib/screening/practical-service.ts",
        "lib/assessments/generated-assessment-service.ts",
        "lib/privacy/retention-worker.ts",
        "lib/screening/candidate-email.ts",
        "lib/portal/portal-service.ts",
      ]) {
        const source = readFileSync(file, "utf8");
        expect(source, file).not.toMatch(/candidateAuditActorId|auditActor/);
      }
      expect(readFileSync("app/api/scim/v2/[[...path]]/route.ts", "utf8")).not.toMatch(/actorUserId:\s*0/);
    });
  });

  describe("practical submission by link", () => {
    it("records CANDIDATE_TOKEN with no user id, in the right company, independently per tenant", async () => {
      const { a, b } = tenants;
      const personA = await applicant(a, "prac-a");
      const personB = await applicant(b, "prac-b");
      const testA = await practical(personA.applicationId);
      const testB = await practical(personB.applicationId);
      await submitPractical(testA.token, { text: "My answer for tenant A, long enough to be accepted by the parser." });
      await submitPractical(testB.token, { text: "My answer for tenant B, long enough to be accepted by the parser." });

      const rowsA = await audits({ action: "PRACTICAL_SUBMITTED", targetId: testA.id });
      const rowsB = await audits({ action: "PRACTICAL_SUBMITTED", targetId: testB.id });
      expect(rowsA).toHaveLength(1);
      expect(rowsB).toHaveLength(1);
      expect(rowsA[0]).toMatchObject({ actorRole: "CANDIDATE_TOKEN", actorUserId: null, companyId: a.companyId, targetType: "CODING_TEST", targetId: testA.id });
      expect(rowsB[0]).toMatchObject({ actorRole: "CANDIDATE_TOKEN", actorUserId: null, companyId: b.companyId, targetType: "CODING_TEST", targetId: testB.id });
      const admins = await allAdminIds();
      expect(admins).toContain(decoyAdminId);
      expect([rowsA[0]!.actorUserId, rowsB[0]!.actorUserId].filter((id) => id !== null && admins.includes(id))).toEqual([]);
      expect(await audits({ action: "PRACTICAL_SUBMITTED", companyId: a.companyId, targetId: testB.id })).toHaveLength(0);
    });

    it("rolls the submission back when its audit row cannot be written, so the candidate can try again", async () => {
      const person = await applicant(tenants.a, "prac-fail");
      const test = await practical(person.applicationId);
      failure.action = "PRACTICAL_SUBMITTED";
      await expect(submitPractical(test.token, { text: "An answer that must not be stored without an audit row." })).rejects.toThrow(/simulated audit persistence failure/);
      expect(await prisma.codingTest.findUniqueOrThrow({ where: { id: test.id }, select: { submittedAt: true, submissionText: true } })).toEqual({ submittedAt: null, submissionText: null });
      expect(await audits({ action: "PRACTICAL_SUBMITTED", targetId: test.id })).toHaveLength(0);

      failure.action = null;
      await submitPractical(test.token, { text: "The retry after the audit store recovered, long enough to be accepted." });
      expect(await audits({ action: "PRACTICAL_SUBMITTED", targetId: test.id })).toHaveLength(1);
    });
  });

  describe("generated assessment submission", () => {
    it("records CANDIDATE_TOKEN with no user id for a link submit, independently per tenant", async () => {
      const { a, b } = tenants;
      const personA = await applicant(a, "gen-a");
      const personB = await applicant(b, "gen-b");
      const inviteA = await invite(a, personA.applicationId);
      const inviteB = await invite(b, personB.applicationId);
      await submitGeneratedAssessment(inviteA.token, null);
      await submitGeneratedAssessment(inviteB.token, null);

      const rowsA = await audits({ action: "ASSESSMENT_SUBMITTED", targetId: personA.applicationId });
      const rowsB = await audits({ action: "ASSESSMENT_SUBMITTED", targetId: personB.applicationId });
      expect(rowsA).toHaveLength(1);
      expect(rowsB).toHaveLength(1);
      expect(rowsA[0]).toMatchObject({ actorRole: "CANDIDATE_TOKEN", actorUserId: null, companyId: a.companyId, targetType: "APPLICATION" });
      expect(rowsB[0]).toMatchObject({ actorRole: "CANDIDATE_TOKEN", actorUserId: null, companyId: b.companyId, targetType: "APPLICATION" });
      expect(await audits({ action: "ASSESSMENT_SUBMITTED", companyId: a.companyId, targetId: personB.applicationId })).toHaveLength(0);
    });

    it("still names the user when a user submits on a candidate's behalf", async () => {
      const { a } = tenants;
      const person = await applicant(a, "gen-admin");
      const row = await invite(a, person.applicationId);
      await submitGeneratedAssessment(row.token, a.adminId);
      const rows = await audits({ action: "ASSESSMENT_SUBMITTED", targetId: person.applicationId });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actorRole: "ADMIN", actorUserId: a.adminId, companyId: a.companyId });
    });

    it("rolls the submit back when its audit row cannot be written", async () => {
      const person = await applicant(tenants.b, "gen-fail");
      const row = await invite(tenants.b, person.applicationId);
      failure.action = "ASSESSMENT_SUBMITTED";
      await expect(submitGeneratedAssessment(row.token, null)).rejects.toThrow(/simulated audit persistence failure/);
      expect((await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: row.id } })).submittedAt).toBeNull();
      expect(await audits({ action: "ASSESSMENT_SUBMITTED", targetId: person.applicationId })).toHaveLength(0);

      failure.action = null;
      await submitGeneratedAssessment(row.token, null);
      expect(await audits({ action: "ASSESSMENT_SUBMITTED", targetId: person.applicationId })).toHaveLength(1);
    });
  });

  describe("retention worker", () => {
    const provider = (companyId: number): RetentionPolicyProvider => ({
      listCompanyIds: async () => [companyId],
      rulesFor: async () => ({ CANDIDATE_PERSONAL_DATA: { retainDays: 365, basis: "Synthetic test rule", closedStatuses: [ApplicationPipelineStatus.REJECTED] } }),
    });
    const aged = async (applicationId: number) => {
      await prisma.$executeRaw`UPDATE "Application" SET "updatedAt" = now() - make_interval(days => 400) WHERE id = ${applicationId}`;
    };

    it("files RETENTION_EXPIRED under SYSTEM_RETENTION with no user id, only for the company it ran for", async () => {
      const { a, b } = tenants;
      const old = await applicant(a, "ret-a", ApplicationPipelineStatus.REJECTED);
      const otherTenant = await applicant(b, "ret-b", ApplicationPipelineStatus.REJECTED);
      await aged(old.applicationId);
      await aged(otherTenant.applicationId);

      const report = await runRetention({ provider: provider(a.companyId), mode: "execute", companyIds: [a.companyId], deps: ok });
      expect(report.companies[0]!.categories[0]!.expired).toBeGreaterThanOrEqual(1);
      const rows = await audits({ action: "RETENTION_EXPIRED", targetId: old.candidateId });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actorRole: "SYSTEM_RETENTION", actorUserId: null, companyId: a.companyId, targetType: "CANDIDATE" });
      expect((await prisma.candidate.findUniqueOrThrow({ where: { id: old.candidateId } })).erasedAt).not.toBeNull();
      // The other tenant was out of scope: not erased, no row, and nothing filed under its company.
      expect((await prisma.candidate.findUniqueOrThrow({ where: { id: otherTenant.candidateId } })).erasedAt).toBeNull();
      expect(await audits({ action: "RETENTION_EXPIRED", companyId: b.companyId })).toHaveLength(0);
    });

    it("surfaces a failed audit write: the erasure stands, the row is missing, and the report counts a failure", async () => {
      const { a } = tenants;
      const row = await applicant(a, "ret-audit-fail", ApplicationPipelineStatus.REJECTED);
      await aged(row.applicationId);
      failure.action = "RETENTION_EXPIRED";
      const report = await runRetention({ provider: provider(a.companyId), mode: "execute", companyIds: [a.companyId], deps: ok });
      const category = report.companies[0]!.categories[0]!;
      expect(category.expired).toBeGreaterThanOrEqual(1);
      expect(category.failed).toBeGreaterThanOrEqual(1);
      expect((await prisma.candidate.findUniqueOrThrow({ where: { id: row.candidateId } })).erasedAt).not.toBeNull();
      expect(await audits({ action: "RETENTION_EXPIRED", targetId: row.candidateId })).toHaveLength(0);
    });
  });

  it("admin attribution is unchanged: an admin action records that admin with role ADMIN", async () => {
    const { a } = tenants;
    const person = await applicant(a, "admin-attr");
    const batch = await prisma.closeOutBatch.create({
      data: { companyId: a.companyId, jobId: a.jobId, category: "SELECTED", reason: "Location mismatch", applicationIds: [person.applicationId], proposedByUserId: a.adminId },
    });
    expect(await cancelCloseOut({ batchId: batch.id, companyId: a.companyId, actorUserId: a.adminId })).toEqual({ ok: true });
    const rows = await audits({ action: "CLOSE_OUT_CANCELLED", targetId: batch.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorRole: "ADMIN", actorUserId: a.adminId, companyId: a.companyId });
    expect(decoyCompanyId).not.toBe(a.companyId);
  });
});

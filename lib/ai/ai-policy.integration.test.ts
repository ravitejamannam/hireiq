import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CandidateStatus, JobStatus, PortalRole, type AiPreference } from "@prisma/client";
import { aiBlockedCandidateIds } from "@/lib/ai/ai-policy";
import { recordAiPreference } from "@/lib/ai/ai-preference-service";
import { completeStructured, setGatewayFetchForTests, type GatewayFeature } from "@/lib/ai/gateway";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";
import { transcribeResumePage } from "@/lib/resumes/layout-vision";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `aipol-${process.pid}-${Date.now()}`;
const EVALUATION: GatewayFeature[] = ["resume_fields", "evidence_review", "assessment_grade", "requirement_quotes", "resume_vision", "notes_draft"];
let calls = 0;

describe.skipIf(integrationDatabase.mode === "skip")("shared AI policy boundary", () => {
  let companyId = 0;
  let otherCompanyId = 0;
  let jobId = 0;
  let adminId = 0;
  const applications = new Map<string, { applicationId: number; candidateId: number }>();

  async function person(label: string, data: { aiPreference?: AiPreference; humanReviewRequestedAt?: Date | null; aiEvaluationOptOut?: boolean } | null) {
    const candidate = await prisma.candidate.create({ data: { name: `${label}`, role: "Eng", experienceYears: 1, status: CandidateStatus.APPLIED, companyId } });
    if (data) {
      const application = await prisma.application.create({ data: { candidateId: candidate.id, jobId, companyId, ...data } });
      applications.set(label, { applicationId: application.id, candidateId: candidate.id });
    } else {
      applications.set(label, { applicationId: 0, candidateId: candidate.id });
    }
    return applications.get(label)!;
  }

  beforeAll(async () => {
    setGatewayFetchForTests(async () => {
      calls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
    });
    companyId = (await prisma.company.create({ data: { name: MARKER, industry: "T", employees: 1, publicSlug: MARKER } })).id;
    otherCompanyId = (await prisma.company.create({ data: { name: `${MARKER}-b`, industry: "T", employees: 1, publicSlug: `${MARKER}-b` } })).id;
    jobId = (await prisma.job.create({ data: { title: "r", status: JobStatus.OPEN, companyId } })).id;
    adminId = (await prisma.user.create({ data: { email: `${MARKER}@hireiq.test`, name: "a", role: PortalRole.ADMIN, passwordHash: "x", emailVerifiedAt: new Date(), companyId } })).id;
    await person("unknown", {});
    await person("refused", { aiPreference: "REFUSED" });
    await person("allowed", { aiPreference: "ALLOWED" });
    await person("allowed-human-review", { aiPreference: "ALLOWED", humanReviewRequestedAt: new Date() });
    await person("legacy-flag-only", { aiPreference: "ALLOWED", aiEvaluationOptOut: true });
    await person("no-application", null);
  });

  afterAll(async () => {
    setGatewayFetchForTests(null);
    await deleteAuditLogsForTests({ companyId });
    await prisma.candidateIntelligenceRun.deleteMany({ where: { companyId } });
    await prisma.candidateEvidence.deleteMany({ where: { companyId } });
    await prisma.application.deleteMany({ where: { companyId } });
    await prisma.candidate.deleteMany({ where: { companyId } });
    await prisma.job.deleteMany({ where: { companyId } });
    await prisma.aIRun.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  });

  async function attempt(feature: GatewayFeature, subject: Parameters<typeof completeStructured>[0]["subject"]) {
    calls = 0;
    await completeStructured({ feature, model: "m", promptVersion: "p", system: "s", user: "u", schemaName: "x", schema: { type: "object" }, apiKey: "test-key", maxRetries: 0, subject }).catch(() => undefined);
    return calls;
  }

  it.each(["unknown", "refused", "allowed-human-review", "legacy-flag-only"])("makes zero model calls for %s on every candidate-evaluation feature", async (label) => {
    const { applicationId, candidateId } = applications.get(label)!;
    for (const feature of EVALUATION) {
      expect(await attempt(feature, { applicationId, companyId }), `${label}/${feature} by application`).toBe(0);
      expect(await attempt(feature, { candidateId, companyId }), `${label}/${feature} by candidate`).toBe(0);
    }
  });

  it("refuses a candidate with no application, a missing subject, and another tenant's application", async () => {
    const none = applications.get("no-application")!;
    const allowed = applications.get("allowed")!;
    for (const feature of EVALUATION) {
      expect(await attempt(feature, { candidateId: none.candidateId, companyId })).toBe(0);
      expect(await attempt(feature, undefined)).toBe(0);
      expect(await attempt(feature, { applicationId: allowed.applicationId, companyId: otherCompanyId })).toBe(0);
    }
  });

  it("calls the model only for an explicitly ALLOWED application with no human review (control)", async () => {
    const { applicationId, candidateId } = applications.get("allowed")!;
    expect(await attempt("resume_fields", { applicationId, companyId })).toBe(1);
    expect(await attempt("assessment_grade", { candidateId, companyId })).toBe(1);
  });

  it("does not apply the candidate rule to job-description features", async () => {
    expect(await attempt("job_description", undefined)).toBe(1);
  });

  it("scanned-page reading follows the same rule", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const audit = (label: string) => {
      const { applicationId } = applications.get(label)!;
      return { companyId, entityType: "Application", entityId: applicationId, applicationId, pageCount: 1, pageIndex: 0, db: prisma as never };
    };
    for (const label of ["unknown", "refused", "allowed-human-review", "legacy-flag-only"]) {
      calls = 0;
      expect(await transcribeResumePage(new Uint8Array([1, 2, 3]), audit(label))).toBeNull();
      expect(calls, label).toBe(0);
    }
    calls = 0;
    await transcribeResumePage(new Uint8Array([1, 2, 3]), audit("allowed"));
    expect(calls).toBe(1);
  });

  it("retrieval eligibility excludes unknown, refused, human-review and application-less candidates", async () => {
    const ids = [...applications.values()].map((row) => row.candidateId);
    const blocked = await aiBlockedCandidateIds(companyId, ids);
    expect([...applications.entries()].filter(([, row]) => !blocked.has(row.candidateId)).map(([label]) => label)).toEqual(["allowed"]);
  });

  it("a recruiter-recorded preference is audited, needs evidence to allow, and a refusal stops queued work", async () => {
    const { applicationId, candidateId } = applications.get("unknown")!;
    await expect(recordAiPreference({ applicationId, companyId, actorUserId: adminId, preference: "ALLOWED", evidence: "ok" })).rejects.toThrow(/permission/);
    await expect(recordAiPreference({ applicationId, companyId: otherCompanyId, actorUserId: adminId, preference: "REFUSED", evidence: "" })).rejects.toThrow(/not found/);
    const evidence = await prisma.candidateEvidence.create({ data: { companyId, candidateId, applicationId, sourceType: "RESUME_DOCUMENT", origin: "CANDIDATE_PROVIDED", inlineText: "x" } });
    const running = await prisma.candidateIntelligenceRun.create({
      data: { companyId, candidateId, evidenceId: evidence.id, status: "RUNNING", extractorType: "DETERMINISTIC_TEXT_V1", extractorVersion: "v1", modelProvider: "none", modelName: "none", promptVersion: "none" },
    });
    await recordAiPreference({ applicationId, companyId, actorUserId: adminId, preference: "ALLOWED", evidence: "Email reply from candidate dated 2026-10-01" });
    expect(await attempt("resume_fields", { applicationId, companyId })).toBe(1);
    await recordAiPreference({ applicationId, companyId, actorUserId: adminId, preference: "REFUSED", evidence: "Candidate withdrew permission by email" });
    expect(await attempt("resume_fields", { applicationId, companyId })).toBe(0);
    expect((await prisma.candidateIntelligenceRun.findUniqueOrThrow({ where: { id: running.id } })).status).toBe("FAILED");
    const row = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(row).toMatchObject({ aiPreference: "REFUSED", aiEvaluationOptOut: true, aiPreferenceSource: "RECRUITER_ATTESTED" });
    expect(await prisma.auditLog.count({ where: { companyId, action: "AI_PREFERENCE_RECORDED", targetId: applicationId } })).toBe(2);
  });
});

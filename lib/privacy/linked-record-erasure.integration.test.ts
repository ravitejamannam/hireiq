import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApplicantImportRowStatus, CandidateStatus, JobStatus, PortalRole } from "@prisma/client";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";
import { eraseCandidate, type ErasureDeps } from "@/lib/privacy/candidate-erasure";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `link-${process.pid}-${Date.now()}`;
const SECRET = `${MARKER}-rationale`;
const deleted: ErasureDeps = { deleteObject: async () => ({ status: "DELETED" }) };

describe.skipIf(integrationDatabase.mode === "skip")("linked inbound, import, and decision erasure", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  let companyA = 0;
  let companyB = 0;
  let userA = 0;
  let userB = 0;
  let jobA = 0;
  let jobA2 = 0;
  let jobB = 0;

  async function tenant(label: string) {
    const slug = `${MARKER}-${label}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    const company = await prisma.company.create({ data: { name: `${MARKER} ${label}`, industry: "T", employees: 2, publicSlug: slug } });
    companyIds.push(company.id);
    const user = await prisma.user.create({
      data: { email: `${MARKER}-${label}@hireiq.test`, name: label, role: PortalRole.ADMIN, passwordHash: "x", companyId: company.id },
    });
    userIds.push(user.id);
    const job = await prisma.job.create({ data: { title: `${MARKER} ${label}`, status: JobStatus.OPEN, companyId: company.id } });
    const route = await prisma.inboundEmailRoute.create({
      data: { companyId: company.id, jobId: job.id, tokenHash: `${MARKER}-${label}-route`, createdByUserId: user.id },
    });
    const batch = await prisma.applicantImportBatch.create({
      data: {
        companyId: company.id,
        jobId: job.id,
        createdByUserId: user.id,
        idempotencyKey: `${MARKER}-${label}`,
        fileSha256: `${MARKER}-${label}-sha`,
        fileName: "import.csv",
        mapping: {},
      },
    });
    return { companyId: company.id, userId: user.id, jobId: job.id, routeId: route.id, batchId: batch.id };
  }

  async function person(companyId: number, jobId: number, label: string) {
    const candidate = await prisma.candidate.create({
      data: { name: label, role: "Eng", experienceYears: 1, status: CandidateStatus.APPLIED, companyId },
    });
    const application = await prisma.application.create({
      data: { candidateId: candidate.id, jobId, companyId, aiPreference: "ALLOWED" },
    });
    return { candidateId: candidate.id, applicationId: application.id };
  }

  beforeAll(async () => {
    const a = await tenant("a");
    const b = await tenant("b");
    companyA = a.companyId;
    companyB = b.companyId;
    userA = a.userId;
    userB = b.userId;
    jobA = a.jobId;
    jobB = b.jobId;
    jobA2 = (await prisma.job.create({ data: { title: `${MARKER} a2`, status: JobStatus.OPEN, companyId: companyA } })).id;
  });

  afterAll(async () => {
    if (companyIds.length === 0) return;
    const where = { companyId: { in: companyIds } };
    await prisma.inboundEmailMessage.deleteMany({ where });
    await prisma.inboundEmailRoute.deleteMany({ where });
    await prisma.applicantImportRow.deleteMany({ where });
    await prisma.applicantImportBatch.deleteMany({ where });
    await prisma.decisionRecord.deleteMany({ where });
    await prisma.candidateErasure.deleteMany({ where });
    await deleteAuditLogsForTests(where);
    await prisma.application.deleteMany({ where });
    await prisma.candidate.deleteMany({ where });
    await prisma.job.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  it("redacts linked inbound messages and leaves other companies, other candidates, and unlinked rows", async () => {
    const mine = await person(companyA, jobA, `${MARKER}-mine`);
    const other = await person(companyA, jobA, `${MARKER}-other`);
    const foreign = await person(companyB, jobB, `${MARKER}-foreign`);
    const routeA = await prisma.inboundEmailRoute.findFirstOrThrow({ where: { companyId: companyA, jobId: jobA } });
    const routeB = await prisma.inboundEmailRoute.findFirstOrThrow({ where: { companyId: companyB, jobId: jobB } });
    const linked = await prisma.inboundEmailMessage.create({
      data: {
        companyId: companyA,
        jobId: jobA,
        routeId: routeA.id,
        providerEventId: `${MARKER}-linked`,
        applicantName: `${MARKER}-linked-name`,
        emailMasked: "l***@test",
        applicantEmailNormalized: `${MARKER}-linked@test`,
        storageKey: `${MARKER}-linked-key`,
        candidateId: mine.candidateId,
        applicationId: mine.applicationId,
        status: "PROCESSED",
        code: "CREATED",
      },
    });
    const byApplication = await prisma.inboundEmailMessage.create({
      data: {
        companyId: companyA,
        jobId: jobA,
        routeId: routeA.id,
        providerEventId: `${MARKER}-by-app`,
        applicantName: `${MARKER}-by-app-name`,
        emailMasked: "a***@test",
        applicantEmailNormalized: `${MARKER}-by-app@test`,
        applicationId: mine.applicationId,
        status: "REVIEW",
        code: "AMBIGUOUS_MATCH",
      },
    });
    const sameCompany = await prisma.inboundEmailMessage.create({
      data: {
        companyId: companyA,
        jobId: jobA,
        routeId: routeA.id,
        providerEventId: `${MARKER}-same-co`,
        applicantName: `${MARKER}-same-co-name`,
        emailMasked: "s***@test",
        applicantEmailNormalized: `${MARKER}-same@test`,
        candidateId: other.candidateId,
        applicationId: other.applicationId,
      },
    });
    const unlinked = await prisma.inboundEmailMessage.create({
      data: {
        companyId: companyA,
        jobId: jobA,
        routeId: routeA.id,
        providerEventId: `${MARKER}-unlinked`,
        applicantName: `${MARKER}-linked-name`,
        emailMasked: "u***@test",
        applicantEmailNormalized: `${MARKER}-unlinked@test`,
        storageKey: `${MARKER}-unlinked-key`,
      },
    });
    const otherCompany = await prisma.inboundEmailMessage.create({
      data: {
        companyId: companyB,
        jobId: jobB,
        routeId: routeB.id,
        providerEventId: `${MARKER}-foreign`,
        applicantName: `${MARKER}-foreign-name`,
        emailMasked: "f***@test",
        applicantEmailNormalized: `${MARKER}-foreign@test`,
        storageKey: `${MARKER}-foreign-key`,
        candidateId: foreign.candidateId,
        applicationId: foreign.applicationId,
      },
    });

    const result = await eraseCandidate({ companyId: companyA, candidateId: mine.candidateId, trigger: "ADMIN_REQUEST", deps: deleted });
    expect(result.status).toBe("COMPLETED");
    expect(result.completedSteps).toEqual(expect.arrayContaining(["inbound-messages", "import-rows", "decision-rationales"]));

    const afterLinked = await prisma.inboundEmailMessage.findUniqueOrThrow({ where: { id: linked.id } });
    expect(afterLinked.applicantName).toBe("ERASED");
    expect(afterLinked.emailMasked).toBeNull();
    expect(afterLinked.applicantEmailNormalized).toBeNull();
    expect(afterLinked.storageKey).toBeNull();
    expect(afterLinked.status).toBe("PROCESSED");
    expect(afterLinked.code).toBe("CREATED");
    expect(afterLinked.candidateId).toBe(mine.candidateId);

    const afterByApplication = await prisma.inboundEmailMessage.findUniqueOrThrow({ where: { id: byApplication.id } });
    expect(afterByApplication.applicantName).toBe("ERASED");
    expect(afterByApplication.applicantEmailNormalized).toBeNull();
    expect(afterByApplication.code).toBe("AMBIGUOUS_MATCH");

    const afterSame = await prisma.inboundEmailMessage.findUniqueOrThrow({ where: { id: sameCompany.id } });
    expect(afterSame.applicantName).toBe(`${MARKER}-same-co-name`);
    expect(afterSame.applicantEmailNormalized).toBe(`${MARKER}-same@test`);

    const afterUnlinked = await prisma.inboundEmailMessage.findUniqueOrThrow({ where: { id: unlinked.id } });
    expect(afterUnlinked.applicantName).toBe(`${MARKER}-linked-name`);
    expect(afterUnlinked.storageKey).toBe(`${MARKER}-unlinked-key`);

    const afterForeign = await prisma.inboundEmailMessage.findUniqueOrThrow({ where: { id: otherCompany.id } });
    expect(afterForeign.applicantName).toBe(`${MARKER}-foreign-name`);
    expect(afterForeign.storageKey).toBe(`${MARKER}-foreign-key`);
  });

  it("redacts a linked import row and leaves sibling and unlinked rows, including their codes", async () => {
    const mine = await person(companyA, jobA, `${MARKER}-import`);
    const sibling = await person(companyA, jobA, `${MARKER}-sibling`);
    const batch = await prisma.applicantImportBatch.findFirstOrThrow({ where: { companyId: companyA } });
    const linked = await prisma.applicantImportRow.create({
      data: {
        batchId: batch.id,
        companyId: companyA,
        rowNumber: 2,
        status: ApplicantImportRowStatus.CREATED,
        code: "CREATED",
        name: `${MARKER}-import-name`,
        emailMasked: "i***@test",
        externalCandidateId: `${MARKER}-ext`,
        candidateId: mine.candidateId,
        applicationId: mine.applicationId,
      },
    });
    const otherRow = await prisma.applicantImportRow.create({
      data: {
        batchId: batch.id,
        companyId: companyA,
        rowNumber: 3,
        status: ApplicantImportRowStatus.ATTACHED,
        code: "ATTACHED",
        name: `${MARKER}-sibling-name`,
        emailMasked: "b***@test",
        externalCandidateId: `${MARKER}-sib`,
        candidateId: sibling.candidateId,
        applicationId: sibling.applicationId,
      },
    });
    const unlinked = await prisma.applicantImportRow.create({
      data: {
        batchId: batch.id,
        companyId: companyA,
        rowNumber: 4,
        status: ApplicantImportRowStatus.SKIPPED,
        code: "SKIPPED",
        name: `${MARKER}-import-name`,
        emailMasked: "n***@test",
      },
    });

    await eraseCandidate({ companyId: companyA, candidateId: mine.candidateId, trigger: "ADMIN_REQUEST", deps: deleted });

    const after = await prisma.applicantImportRow.findUniqueOrThrow({ where: { id: linked.id } });
    expect(after.name).toBe("ERASED");
    expect(after.emailMasked).toBeNull();
    expect(after.externalCandidateId).toBeNull();
    expect(after.status).toBe("CREATED");
    expect(after.code).toBe("CREATED");
    expect(after.candidateId).toBe(mine.candidateId);
    expect(after.applicationId).toBe(mine.applicationId);
    expect(after.batchId).toBe(batch.id);
    expect(after.rowNumber).toBe(2);

    const afterSibling = await prisma.applicantImportRow.findUniqueOrThrow({ where: { id: otherRow.id } });
    expect(afterSibling.name).toBe(`${MARKER}-sibling-name`);
    expect(afterSibling.emailMasked).toBe("b***@test");
    expect(afterSibling.externalCandidateId).toBe(`${MARKER}-sib`);
    expect(afterSibling.code).toBe("ATTACHED");

    const afterUnlinked = await prisma.applicantImportRow.findUniqueOrThrow({ where: { id: unlinked.id } });
    expect(afterUnlinked.name).toBe(`${MARKER}-import-name`);
    expect(afterUnlinked.emailMasked).toBe("n***@test");
    expect(afterUnlinked.code).toBe("SKIPPED");
  });

  it("redacts every decision rationale for the candidate in that company and leaves the others", async () => {
    const mine = await person(companyA, jobA, `${MARKER}-decider`);
    const second = await prisma.application.create({
      data: { candidateId: mine.candidateId, jobId: jobA2, companyId: companyA, aiPreference: "ALLOWED" },
    });
    const other = await person(companyA, jobA, `${MARKER}-other-decision`);
    const foreign = await person(companyB, jobB, `${MARKER}-foreign-decision`);
    const first = await prisma.decisionRecord.create({
      data: { companyId: companyA, applicationId: mine.applicationId, rationale: SECRET, decidedByUserId: userA },
    });
    const extra = await prisma.decisionRecord.create({
      data: { companyId: companyA, applicationId: second.id, rationale: `${SECRET}-second`, decidedByUserId: userA },
    });
    const sameCompany = await prisma.decisionRecord.create({
      data: { companyId: companyA, applicationId: other.applicationId, rationale: `${SECRET}-other`, decidedByUserId: userA },
    });
    const otherCompany = await prisma.decisionRecord.create({
      data: { companyId: companyB, applicationId: foreign.applicationId, rationale: `${SECRET}-foreign`, decidedByUserId: userB },
    });

    await eraseCandidate({ companyId: companyA, candidateId: mine.candidateId, trigger: "ADMIN_REQUEST", deps: deleted });

    expect((await prisma.decisionRecord.findUniqueOrThrow({ where: { id: first.id } })).rationale).toBe("erased");
    expect((await prisma.decisionRecord.findUniqueOrThrow({ where: { id: extra.id } })).rationale).toBe("erased");
    expect((await prisma.decisionRecord.findUniqueOrThrow({ where: { id: first.id } })).decidedByUserId).toBe(userA);
    expect((await prisma.decisionRecord.findUniqueOrThrow({ where: { id: extra.id } })).applicationId).toBe(second.id);
    expect((await prisma.decisionRecord.findUniqueOrThrow({ where: { id: sameCompany.id } })).rationale).toBe(`${SECRET}-other`);
    expect((await prisma.decisionRecord.findUniqueOrThrow({ where: { id: otherCompany.id } })).rationale).toBe(`${SECRET}-foreign`);
  });

  it("keeps the inbound storage key when deletion fails, then clears it on retry without moving erasedAt", async () => {
    const mine = await person(companyA, jobA, `${MARKER}-storage`);
    const route = await prisma.inboundEmailRoute.findFirstOrThrow({ where: { companyId: companyA, jobId: jobA } });
    const key = `${MARKER}-retry-key`;
    const message = await prisma.inboundEmailMessage.create({
      data: {
        companyId: companyA,
        jobId: jobA,
        routeId: route.id,
        providerEventId: `${MARKER}-retry`,
        applicantName: `${MARKER}-retry-name`,
        emailMasked: "r***@test",
        applicantEmailNormalized: `${MARKER}-retry@test`,
        storageKey: key,
        candidateId: mine.candidateId,
        applicationId: mine.applicationId,
        status: "FAILED",
        code: "STORAGE_FAILED",
      },
    });
    let healthy = false;
    const deps: ErasureDeps = {
      deleteObject: async (storageKey) => (storageKey === key && !healthy ? { status: "FAILED", code: "STORAGE_DELETE_FAILED" } : { status: "DELETED" }),
    };

    const first = await eraseCandidate({ companyId: companyA, candidateId: mine.candidateId, trigger: "ADMIN_REQUEST", deps });
    expect(first.status).toBe("PARTIAL");
    expect(first.failedSteps).toContain("inbound-messages");
    const kept = await prisma.inboundEmailMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(kept.storageKey).toBe(key);
    expect(kept.applicantName).toBe("ERASED");
    expect(kept.applicantEmailNormalized).toBeNull();
    expect(kept.code).toBe("STORAGE_FAILED");
    const stamp = (await prisma.candidate.findUniqueOrThrow({ where: { id: mine.candidateId } })).erasedAt;
    expect(stamp).not.toBeNull();

    healthy = true;
    const retried = await eraseCandidate({ companyId: companyA, candidateId: mine.candidateId, trigger: "ADMIN_REQUEST", deps });
    expect(retried.status).toBe("COMPLETED");
    expect(retried.failedSteps).not.toContain("inbound-messages");
    expect((await prisma.inboundEmailMessage.findUniqueOrThrow({ where: { id: message.id } })).storageKey).toBeNull();
    expect((await prisma.candidate.findUniqueOrThrow({ where: { id: mine.candidateId } })).erasedAt?.toISOString()).toBe(stamp!.toISOString());
  });

  it("a second erasure stays completed and does not move erasedAt", async () => {
    const mine = await person(companyA, jobA2, `${MARKER}-twice`);
    const batch = await prisma.applicantImportBatch.findFirstOrThrow({ where: { companyId: companyA } });
    const rowNumber = 20 + mine.candidateId;
    await prisma.applicantImportRow.create({
      data: {
        batchId: batch.id,
        companyId: companyA,
        rowNumber,
        status: ApplicantImportRowStatus.ATTACHED,
        code: "ATTACHED",
        name: `${MARKER}-twice-name`,
        emailMasked: "t***@test",
        externalCandidateId: `${MARKER}-twice-ext`,
        candidateId: mine.candidateId,
        applicationId: mine.applicationId,
      },
    });
    await prisma.decisionRecord.create({
      data: { companyId: companyA, applicationId: mine.applicationId, rationale: `${SECRET}-twice`, decidedByUserId: userA },
    });

    const first = await eraseCandidate({ companyId: companyA, candidateId: mine.candidateId, trigger: "ADMIN_REQUEST", deps: deleted });
    expect(first.status).toBe("COMPLETED");
    const stamp = (await prisma.candidate.findUniqueOrThrow({ where: { id: mine.candidateId } })).erasedAt;
    const second = await eraseCandidate({ companyId: companyA, candidateId: mine.candidateId, trigger: "ADMIN_REQUEST", deps: deleted });
    expect(second.status).toBe("COMPLETED");
    expect(second.attempts).toBeGreaterThan(1);
    const again = await prisma.candidate.findUniqueOrThrow({ where: { id: mine.candidateId } });
    expect(again.erasedAt?.toISOString()).toBe(stamp!.toISOString());
    const row = await prisma.applicantImportRow.findFirstOrThrow({ where: { companyId: companyA, candidateId: mine.candidateId } });
    expect(row.name).toBe("ERASED");
    expect(row.code).toBe("ATTACHED");
    const decision = await prisma.decisionRecord.findFirstOrThrow({ where: { companyId: companyA, applicationId: mine.applicationId } });
    expect(decision.rationale).toBe("erased");
  });
});

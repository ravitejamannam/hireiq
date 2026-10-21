import "@/lib/evidence-graph/evidence-graph-test-env";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CandidateStatus, JobStatus } from "@prisma/client";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";
import { eraseCandidate, retryIncompleteErasures, type ErasureDeps } from "@/lib/privacy/candidate-erasure";
import { createAiRunUnlessErased } from "@/lib/privacy/erasure-guard";
import { buildResumeStorageKey, deleteResumeObject, storeResume } from "@/lib/resumes/storage";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `vis-${process.pid}-${Date.now()}`;
const SECRET = `${MARKER}-secret-quote`;
const localRoot = process.env.RESUME_STORAGE_DIR?.trim() || ".data/resumes";

describe.skipIf(integrationDatabase.mode === "skip")("resume-vision erasure and storage deletion results", () => {
  let companyId = 0;
  let jobId = 0;
  const keys: string[] = [];

  async function candidate(label: string) {
    const row = await prisma.candidate.create({ data: { name: label, role: "Eng", experienceYears: 1, status: CandidateStatus.APPLIED, companyId } });
    const application = await prisma.application.create({ data: { candidateId: row.id, jobId, companyId, aiPreference: "ALLOWED" } });
    const key = buildResumeStorageKey(companyId, row.id, "pdf");
    keys.push(key);
    const document = await prisma.candidateResumeDocument.create({
      data: { companyId, candidateId: row.id, applicationId: application.id, storageKey: key, fileName: `${label}.pdf`, contentType: "application/pdf", sizeBytes: 1, contentSha256: "x", parseStatus: "READY", extractedText: SECRET },
    });
    return { candidateId: row.id, applicationId: application.id, documentId: document.id, key };
  }

  const run = (entityType: string, entityId: number) =>
    prisma.aIRun.create({
      data: { companyId, feature: "resume.vision", entityType, entityId, modelId: "m", promptVersion: "v", inputHash: "h", outputJson: { text: SECRET }, latencyMs: 1 },
    });

  const outputs = (entityType: string, entityIds: number[]) =>
    prisma.aIRun.findMany({ where: { companyId, entityType, entityId: { in: entityIds } } });

  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: MARKER, industry: "T", employees: 2, publicSlug: MARKER } });
    companyId = company.id;
    jobId = (await prisma.job.create({ data: { title: MARKER, status: JobStatus.OPEN, companyId } })).id;
  });

  afterAll(async () => {
    const where = { companyId };
    await deleteAuditLogsForTests(where);
    await prisma.aIRun.deleteMany({ where });
    await prisma.candidateErasure.deleteMany({ where });
    await prisma.candidateResumeDocument.deleteMany({ where });
    await prisma.application.deleteMany({ where });
    await prisma.candidate.deleteMany({ where });
    await prisma.job.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: companyId } });
    for (const key of keys) await deleteResumeObject(key);
    await rm(path.join(localRoot, "dir-as-key"), { recursive: true, force: true });
  });

  it("erasing one candidate on a shared job clears only that candidate's vision output", async () => {
    const one = await candidate("one");
    const two = await candidate("two");
    const jobLevel = await run("Job", jobId); // legacy shared record: job-level, not attributable to a person
    const oneRuns = [await run("Application", one.applicationId), await run("CandidateResumeDocument", one.documentId)];
    const twoRuns = [await run("Application", two.applicationId), await run("CandidateResumeDocument", two.documentId)];

    await eraseCandidate({ companyId, candidateId: one.candidateId, trigger: "ADMIN_REQUEST", deps: { deleteObject: async () => ({ status: "DELETED" }) } });

    const after = await prisma.aIRun.findMany({ where: { id: { in: [...oneRuns, ...twoRuns, jobLevel].map((row) => row.id) } } });
    const byId = new Map(after.map((row) => [row.id, JSON.stringify(row.outputJson)]));
    for (const row of oneRuns) expect(byId.get(row.id)).not.toContain(SECRET);
    for (const row of twoRuns) expect(byId.get(row.id)).toContain(SECRET);
    expect(byId.get(jobLevel.id)).toContain(SECRET);
    expect((await prisma.candidateResumeDocument.findUniqueOrThrow({ where: { id: two.documentId } })).extractedText).toBe(SECRET);
    expect((await prisma.candidateResumeDocument.findUniqueOrThrow({ where: { id: one.documentId } })).extractedText).toBeNull();
  });

  it("a late vision run for an erased candidate is refused, while another candidate's is accepted", async () => {
    const gone = await candidate("late-gone");
    const live = await candidate("late-live");
    await eraseCandidate({ companyId, candidateId: gone.candidateId, trigger: "ADMIN_REQUEST", deps: { deleteObject: async () => ({ status: "ABSENT" }) } });
    const data = (entityType: string, entityId: number) => ({ companyId, feature: "resume.vision", entityType, entityId, modelId: "m", promptVersion: "v", inputHash: "h", outputJson: {}, latencyMs: 1 });
    expect(await createAiRunUnlessErased(prisma, data("Application", gone.applicationId))).toBe(false);
    expect(await createAiRunUnlessErased(prisma, data("CandidateResumeDocument", gone.documentId))).toBe(false);
    expect(await createAiRunUnlessErased(prisma, data("Application", live.applicationId))).toBe(true);
    expect(await outputs("Application", [gone.applicationId])).toHaveLength(0);
    expect(await outputs("CandidateResumeDocument", [gone.documentId])).toHaveLength(0);
  });

  it("the local driver reports DELETED, ABSENT and FAILED distinctly", async () => {
    const key = buildResumeStorageKey(companyId, 0, "txt");
    await storeResume(key, Buffer.from("hello"));
    expect(await deleteResumeObject(key)).toEqual({ status: "DELETED" });
    expect(await deleteResumeObject(key)).toEqual({ status: "ABSENT" });
    // A directory where the object should be makes the delete fail for a reason other than "not found".
    await mkdir(path.join(localRoot, "dir-as-key", "nested"), { recursive: true });
    const failed = await deleteResumeObject("dir-as-key");
    expect(failed.status).toBe("FAILED");
  });

  it("partial erasure: deleted, absent and failed objects are counted, the failure is not called deleted, and the retry finishes", async () => {
    const person = await candidate("partial");
    const second = await prisma.candidateResumeDocument.create({
      data: { companyId, candidateId: person.candidateId, storageKey: `${MARKER}-second`, fileName: "b.pdf", contentType: "application/pdf", sizeBytes: 1, contentSha256: "x", parseStatus: "READY" },
    });
    const third = await prisma.candidateResumeDocument.create({
      data: { companyId, candidateId: person.candidateId, storageKey: `${MARKER}-third`, fileName: "c.pdf", contentType: "application/pdf", sizeBytes: 1, contentSha256: "x", parseStatus: "READY" },
    });
    let providerHealthy = false;
    const deps: ErasureDeps = {
      deleteObject: async (key) => {
        if (key === person.key) return { status: "DELETED" };
        if (key === `${MARKER}-second`) return { status: "ABSENT" };
        return providerHealthy ? { status: "DELETED" } : { status: "FAILED", code: "STORAGE_DELETE_FAILED" };
      },
    };
    const first = await eraseCandidate({ companyId, candidateId: person.candidateId, trigger: "ADMIN_REQUEST", deps });
    expect(first.status).toBe("PARTIAL");
    expect(first.storage.failed).toBe(1);
    expect(first.storage.deleted + first.storage.absent).toBeGreaterThanOrEqual(2);
    expect(first.failedSteps.length).toBeGreaterThan(0);
    const ledger = await prisma.candidateErasure.findFirstOrThrow({ where: { companyId, candidateId: person.candidateId } });
    expect(ledger.status).toBe("PARTIAL");
    // The key that could not be deleted stays on the row so the retry can find it.
    expect((await prisma.candidateResumeDocument.findUniqueOrThrow({ where: { id: third.id } })).storageKey).toBe(`${MARKER}-third`);
    expect(second.id).not.toBe(third.id);

    providerHealthy = true;
    const retried = await eraseCandidate({ companyId, candidateId: person.candidateId, trigger: "ADMIN_REQUEST", deps });
    expect(retried.status).toBe("COMPLETED");
    expect(retried.storage.failed).toBe(0);
    expect(typeof retryIncompleteErasures).toBe("function");
  });
});

import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobStatus } from "@prisma/client";
import { deleteSelfIdentification, saveSelfIdentification, SelfIdentificationError } from "@/lib/fairness/self-id";
import { prisma } from "@/lib/prisma";
import { POST as statusSelfId } from "@/app/status/[token]/self-id/route";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `selfid-${process.pid}-${Date.now()}`;

describe.skipIf(integrationDatabase.mode === "skip")("self-identification", () => {
  const companyIds: number[] = [];
  let a = { companyId: 0, candidateId: 0, applicationId: 0, token: "" };
  let b = { companyId: 0, candidateId: 0, applicationId: 0, token: "" };

  async function tenant(label: string) {
    const company = await prisma.company.create({
      data: { name: `${MARKER}-${label}`, industry: "Test", employees: 1, publicSlug: `${MARKER}-${label}` },
    });
    companyIds.push(company.id);
    const candidate = await prisma.candidate.create({
      data: { name: `Synthetic ${label}`, role: "Engineer", experienceYears: 3, status: "APPLIED", companyId: company.id },
    });
    const job = await prisma.job.create({ data: { title: `${MARKER}-${label}`, status: JobStatus.OPEN, companyId: company.id } });
    const token = `${MARKER}-${label}-${randomUUID()}`;
    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        companyId: company.id,
        statusTokenHash: createHash("sha256").update(token, "utf8").digest("hex"),
      },
    });
    return { companyId: company.id, candidateId: candidate.id, applicationId: application.id, token };
  }

  beforeAll(async () => {
    a = await tenant("a");
    b = await tenant("b");
  });

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.candidateSelfIdentification.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidateSelfIdentification.deleteMany({ where: { candidateId: { in: [a.candidateId, b.candidateId] } } });
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  const rowFor = (candidateId: number) => prisma.candidateSelfIdentification.findUnique({ where: { candidateId } });

  it("stores a voluntary answer under the owning company and then erases it", async () => {
    await saveSelfIdentification({ candidateId: a.candidateId, companyId: a.companyId, gender: "woman", ageBand: "25_34" });
    const row = await rowFor(a.candidateId);
    expect(row).toMatchObject({ companyId: a.companyId, gender: "woman", ageBand: "25_34" });
    await deleteSelfIdentification(a.candidateId);
    expect(await rowFor(a.candidateId)).toBeNull();
  });

  it("rejects the wrong company and writes nothing", async () => {
    await expect(saveSelfIdentification({ candidateId: b.candidateId, companyId: a.companyId, gender: "woman" })).rejects.toBeInstanceOf(SelfIdentificationError);
    expect(await rowFor(b.candidateId)).toBeNull();
  });

  it("rejects a missing candidate and writes nothing", async () => {
    const before = await prisma.candidateSelfIdentification.count({ where: { companyId: a.companyId } });
    await expect(saveSelfIdentification({ candidateId: 2_000_000_000, companyId: a.companyId, gender: "man" })).rejects.toBeInstanceOf(SelfIdentificationError);
    expect(await prisma.candidateSelfIdentification.count({ where: { companyId: a.companyId } })).toBe(before);
  });

  it("does not overwrite an existing valid record on a mismatched update", async () => {
    await saveSelfIdentification({ candidateId: b.candidateId, companyId: b.companyId, gender: "man", region: "south" });
    const before = await rowFor(b.candidateId);
    await expect(saveSelfIdentification({ candidateId: b.candidateId, companyId: a.companyId, gender: "woman", region: "north" })).rejects.toBeInstanceOf(SelfIdentificationError);
    const after = await rowFor(b.candidateId);
    expect(after).toEqual(before);
    expect(after).toMatchObject({ companyId: b.companyId, gender: "man", region: "south" });
    await deleteSelfIdentification(b.candidateId);
  });

  it("the status-link route still saves for a legitimate request and returns 404 for an unknown token", async () => {
    const form = new FormData();
    form.set("gender", "non_binary");
    const ok = await statusSelfId(new Request("http://localhost/status/x/self-id", { method: "POST", body: form }), {
      params: Promise.resolve({ token: a.token }),
    });
    expect(ok.status).toBe(303);
    expect(await rowFor(a.candidateId)).toMatchObject({ companyId: a.companyId, gender: "non_binary" });
    await deleteSelfIdentification(a.candidateId);

    const missing = await statusSelfId(new Request("http://localhost/status/x/self-id", { method: "POST", body: form }), {
      params: Promise.resolve({ token: "unknown-token" }),
    });
    expect(missing.status).toBe(404);
  });

  it("the status-link route answers 404 and writes nothing once the candidate is erased", async () => {
    const erased = await tenant("erased");
    await prisma.candidate.update({ where: { id: erased.candidateId }, data: { erasedAt: new Date() } });
    const form = new FormData();
    form.set("gender", "woman");
    const response = await statusSelfId(new Request("http://localhost/status/x/self-id", { method: "POST", body: form }), {
      params: Promise.resolve({ token: erased.token }),
    });
    expect(response.status).toBe(404);
    expect(await rowFor(erased.candidateId)).toBeNull();
  });

  it("erasure race: a save racing the tombstone and cleanup never leaves a row behind", async () => {
    for (let i = 0; i < 20; i += 1) {
      const t = await tenant(`race${i}`);
      const erase = async () => {
        await prisma.candidate.update({ where: { id: t.candidateId }, data: { erasedAt: new Date() } });
        await deleteSelfIdentification(t.candidateId);
      };
      const save = saveSelfIdentification({ candidateId: t.candidateId, companyId: t.companyId, gender: "woman" }).catch((error) => {
        expect(error).toBeInstanceOf(SelfIdentificationError);
      });
      await Promise.all([i % 2 === 0 ? save : erase(), i % 2 === 0 ? erase() : save]);
      expect(await rowFor(t.candidateId)).toBeNull();
    }
  });

  it("the portal route source still passes the application's own candidate and company", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("app/portal/self-id/route.ts", "utf8");
    expect(source).toContain("candidateId: application.candidateId");
    expect(source).toContain("companyId: application.companyId");
    expect(source).toContain("SelfIdentificationError");
  });
});

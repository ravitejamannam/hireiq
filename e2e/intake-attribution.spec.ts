import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { CandidateStatus, JobSpecificationVersionStatus, JobStatus, PortalRole } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";
import { assertE2eDatabase } from "@/lib/testing/e2e-database-guard";

const APPROVED_DATABASE = "hireiq_e2e_disp_import_20261020";
const guarded = assertE2eDatabase();
if (guarded.database !== APPROVED_DATABASE) {
  throw new Error("Intake E2E refused: database is not the approved import disposable database.");
}

const marker = `intake${Date.now()}`;
const password = `Intake-${randomBytes(9).toString("base64url")}`;
const adminEmail = `admin-${marker}@example.test`;

const ids = {
  companyA: 0,
  companyB: 0,
  userId: 0,
  jobId: 0,
  specId: 0,
  candidateIds: [] as number[],
  applicationIds: [] as number[],
  tokenId: 0,
};

test.beforeAll(async () => {
  assertE2eDatabase();
  const companyA = await prisma.company.create({
    data: { name: `Fixture Co ${marker}`, industry: "Software", employees: 2, publicSlug: `fixture-${marker}`.slice(0, 60) },
  });
  const companyB = await prisma.company.create({
    data: { name: `Other Co ${marker}`, industry: "Software", employees: 2, publicSlug: `other-${marker}`.slice(0, 60) },
  });
  ids.companyA = companyA.id;
  ids.companyB = companyB.id;
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: "Fixture Admin",
      role: PortalRole.ADMIN,
      companyId: companyA.id,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
    },
  });
  ids.userId = admin.id;
  await prisma.organizationMember.create({
    data: { companyId: companyA.id, userId: admin.id, role: "OWNER", status: "ACTIVE" },
  });
  const job = await prisma.job.create({
    data: { title: `Fixture Role ${marker}`, companyId: companyA.id, status: JobStatus.OPEN },
  });
  ids.jobId = job.id;
  const spec = await prisma.jobSpecificationVersion.create({
    data: {
      jobId: job.id,
      versionNumber: 1,
      status: JobSpecificationVersionStatus.PUBLISHED,
      title: job.title,
      publishedAt: new Date("2026-03-01T00:00:00.000Z"),
    },
  });
  ids.specId = spec.id;
  const when = new Date("2026-03-15T12:00:00.000Z");
  const imported = await person(companyA.id, job.id, spec.id, "Fixture Import", "import", {
    sourceChannel: "MANUAL",
    externalApplicationId: `import:900:${marker.length}`,
    receivedAt: when,
  });
  await prisma.applicationIngestionEvent.create({
    data: {
      companyId: companyA.id,
      jobId: job.id,
      applicationId: imported.applicationId,
      candidateId: imported.candidateId,
      sourceChannel: "LINKEDIN",
      jobSpecificationVersionId: spec.id,
      status: "PROCESSED",
      applicantName: "Fixture Import",
      receivedAt: new Date("2026-03-16T12:00:00.000Z"),
    },
  });
  await person(companyA.id, job.id, spec.id, "Fixture Inbound", "inbound", {
    sourceChannel: "MANUAL",
    externalApplicationId: `inbound:${marker.length}`,
    receivedAt: when,
  });
  const legacyCandidate = await prisma.candidate.create({
    data: { name: "Fixture Legacy", role: "Engineer", experienceYears: 1, status: CandidateStatus.APPLIED, companyId: companyA.id },
  });
  ids.candidateIds.push(legacyCandidate.id);
  const legacy = await prisma.application.create({
    data: {
      candidateId: legacyCandidate.id,
      jobId: job.id,
      companyId: companyA.id,
      source: "NAUKRI",
      createdAt: when,
    },
  });
  ids.applicationIds.push(legacy.id);
  const otherJob = await prisma.job.create({
    data: { title: `Other Role ${marker}`, companyId: companyB.id, status: JobStatus.OPEN },
  });
  const otherSpec = await prisma.jobSpecificationVersion.create({
    data: {
      jobId: otherJob.id,
      versionNumber: 1,
      status: JobSpecificationVersionStatus.PUBLISHED,
      title: otherJob.title,
      publishedAt: when,
    },
  });
  await person(companyB.id, otherJob.id, otherSpec.id, "Fixture Other", "other", {
    sourceChannel: "REFERRAL",
    externalApplicationId: null,
    receivedAt: when,
  });
  const apiKey = `hireiq_${companyA.id}_${marker}`;
  const token = await prisma.apiToken.create({
    data: { companyId: companyA.id, name: `fixture-${marker}`, tokenHash: createHash("sha256").update(apiKey, "utf8").digest("hex") },
  });
  ids.tokenId = token.id;
  process.env.INTAKE_E2E_API_KEY = apiKey;
});

async function person(
  companyId: number,
  jobId: number,
  specId: number,
  name: string,
  label: string,
  event: { sourceChannel: "MANUAL" | "REFERRAL"; externalApplicationId: string | null; receivedAt: Date },
) {
  const candidate = await prisma.candidate.create({
    data: { name, role: "Engineer", experienceYears: 1, status: CandidateStatus.APPLIED, companyId },
  });
  ids.candidateIds.push(candidate.id);
  const application = await prisma.application.create({
    data: { candidateId: candidate.id, jobId, companyId, createdAt: event.receivedAt },
  });
  ids.applicationIds.push(application.id);
  await prisma.applicationIngestionEvent.create({
    data: {
      companyId,
      jobId,
      applicationId: application.id,
      candidateId: candidate.id,
      sourceChannel: event.sourceChannel,
      externalApplicationId: event.externalApplicationId,
      jobSpecificationVersionId: specId,
      status: "PROCESSED",
      applicantName: name,
      receivedAt: event.receivedAt,
    },
  });
  return { candidateId: candidate.id, applicationId: application.id, label };
}

test.afterAll(async () => {
  const companyIds = [ids.companyA, ids.companyB].filter((id) => id > 0);
  if (companyIds.length === 0) return;
  try {
    await prisma.authRateLimit.deleteMany({
      where: { OR: companyIds.map((companyId) => ({ key: `apiKeyToken:apiKey:${companyId}` })) },
    });
    if (ids.tokenId) await prisma.apiToken.deleteMany({ where: { id: ids.tokenId } });
    await prisma.applicantImportRow.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.applicantImportBatch.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.applicantImportTemplate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.applicationIngestionEvent.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.updateMany({
      where: { companyId: { in: companyIds } },
      data: { currentPublishedSpecificationVersionId: null },
    });
    await prisma.jobSpecificationVersion.deleteMany({ where: { job: { companyId: { in: companyIds } } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.organizationMember.deleteMany({ where: { companyId: { in: companyIds } } });
    await deleteAuditLogsForTests({ companyId: { in: companyIds } });
    if (ids.userId) await prisma.user.deleteMany({ where: { id: ids.userId } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  } catch (error) {
    console.error("Intake fixture cleanup failed", {
      companyIds,
      userId: ids.userId,
      jobId: ids.jobId,
      applicationIds: ids.applicationIds,
      candidateIds: ids.candidateIds,
      tokenId: ids.tokenId,
    });
    throw error;
  } finally {
    delete process.env.INTAKE_E2E_API_KEY;
    await prisma.$disconnect();
  }
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("you@company.com").fill(adminEmail);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  const overlay = page.getByRole("button", { name: "Collapse issues badge" });
  if (await overlay.isVisible().catch(() => false)) await overlay.click();
}

test("admin import, analytics, funnel, and company API stay on the disposable database", async ({ page, request }) => {
  assertE2eDatabase();
  const before = await prisma.application.count({ where: { companyId: ids.companyA } });
  await signIn(page);
  await page.goto(`/dashboard/jobs/${ids.jobId}/import`);
  await expect(page.getByRole("heading", { name: "Import applicants" })).toBeVisible();
  await expect(page.getByText("This page does not exist")).toHaveCount(0);

  await page.locator("input[type=file]").setInputFiles({
    name: "fixture.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Full name,Email\nFixture Upload,fixture-upload@example.test\n"),
  });
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "create" })).toBeVisible();
  expect(await prisma.application.count({ where: { companyId: ids.companyA } })).toBe(before);

  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByText("Import finished.")).toBeVisible();
  expect(await prisma.application.count({ where: { companyId: ids.companyA } })).toBe(before + 1);

  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByText("This file was already imported. No new applications were created.")).toBeVisible();
  expect(await prisma.application.count({ where: { companyId: ids.companyA } })).toBe(before + 1);

  await page.goto("/dashboard/analytics?from=2026-03-15&to=2026-03-15");
  await expect(page.getByRole("heading", { name: "Channel performance" })).toBeVisible();
  const channel = page.locator("table", { has: page.getByText("Intake") });
  await expect(channel.getByRole("cell", { name: "CSV Import" })).toBeVisible();
  await expect(channel.getByRole("cell", { name: "Inbound Email" })).toBeVisible();
  await expect(channel.getByRole("cell", { name: "Not Recorded" })).toBeVisible();
  await expect(channel.getByRole("cell", { name: "Referral" })).toHaveCount(0);

  await page.goto("/dashboard/analytics?from=2020-01-01&to=2020-01-02");
  await expect(page.getByText("No applications in this range.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: /^CSV Import:/ })).toBeVisible();

  await page.goto(`/dashboard/requirements/${ids.jobId}`);
  await expect(page.getByText(/\/c\/fixture-intake/)).toBeVisible();
  await page.getByRole("tab", { name: "Activity" }).click();
  const intakeSources = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Source", exact: true }),
  });
  await expect(intakeSources.getByText("CSV Import", { exact: true })).toBeVisible();
  await expect(intakeSources.getByText("2 applications")).toBeVisible();
  await expect(intakeSources.getByText("Inbound Email", { exact: true })).toBeVisible();
  await expect(intakeSources.getByText("Naukri", { exact: true })).toBeVisible();
  await expect(intakeSources.getByText("LinkedIn", { exact: true })).toHaveCount(0);
  await expect(intakeSources.getByText("Referral", { exact: true })).toHaveCount(0);

  const apiKey = process.env.INTAKE_E2E_API_KEY;
  if (!apiKey) throw new Error("Test API key was not created.");
  const response = await request.get("/api/v1/applications", {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.count).toBe(body.applications.length);
  expect(body.count).toBeLessThanOrEqual(100);
  expect(body.applications).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: "LINKEDIN", intakeMethod: "CSV Import" }),
    expect.objectContaining({ source: "MANUAL", intakeMethod: "Inbound Email" }),
    expect.objectContaining({ source: "MANUAL", intakeMethod: "CSV Import" }),
    expect.objectContaining({ source: null, intakeMethod: "Not Recorded" }),
  ]));
  expect(body.applications).toHaveLength(4);
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain("externalApplicationId");
  expect(serialized).not.toContain("import:");
  expect(serialized).not.toContain("inbound:");
  expect(serialized).not.toContain("Fixture Other");
  for (const row of body.applications as Array<Record<string, unknown>>) {
    expect(Object.keys(row).sort()).toEqual(["appliedAt", "id", "intakeMethod", "jobId", "name", "source", "status"]);
  }
});

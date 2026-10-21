import { createHash, randomBytes } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertE2eDatabase } from "@/lib/testing/e2e-database-guard";

/**
 * Candidate-side Monaco editor through a real browser with real key presses.
 * Synthetic data only. The database guard runs before any client is constructed.
 */
const guarded = assertE2eDatabase();
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
void guarded;
const MARKER = `e2e-editor-${Date.now()}`;
const CODING_ID = "code-1";
const LIMIT_MINUTES = 20;
const ITEMS = [
  { id: CODING_ID, type: "coding", prompt: "Write a JavaScript function add(a, b) that returns the sum.", requirement: "JavaScript", rubricCriterion: "Correctness", difficulty: "medium", language: "javascript" },
  { id: "short-1", type: "short_answer", prompt: "In a few sentences, explain how you test an API.", requirement: "Testing", rubricCriterion: "Testing", difficulty: "easy" },
  { id: "short-2", type: "short_answer", prompt: "In a few sentences, explain an index in SQL.", requirement: "SQL", rubricCriterion: "SQL", difficulty: "medium" },
  { id: "scenario-1", type: "scenario", prompt: "A teammate wants to skip tests before a release. What do you do?", requirement: "Testing", rubricCriterion: "Judgment", difficulty: "hard" },
  { id: "mc-1", type: "multiple_choice", prompt: "Which option best shows evidence of debugging skill?", choices: ["A concrete example", "A guess"], correctIndex: 0, requirement: "Debugging", rubricCriterion: "Debugging", difficulty: "easy" },
  { id: "mc-2", type: "multiple_choice", prompt: "Which option best shows evidence of API design skill?", choices: ["A concrete example", "A guess"], correctIndex: 0, requirement: "APIs", rubricCriterion: "APIs", difficulty: "medium" },
];

let companyId = 0;
let jobId = 0;

async function newInvite(label: string) {
  const candidate = await prisma.candidate.create({
    data: { name: `${MARKER} ${label}`, role: "Engineer", experienceYears: 3, status: "APPLIED", companyId },
  });
  const application = await prisma.application.create({
    data: { candidateId: candidate.id, jobId, companyId, aiEvaluationOptOut: true, aiOptOutAt: new Date() },
  });
  const assessment = await prisma.generatedAssessment.findFirstOrThrow({ where: { jobId } });
  const rawToken = randomBytes(32).toString("base64url");
  const invite = await prisma.generatedAssessmentInvite.create({
    data: {
      applicationId: application.id,
      assessmentId: assessment.id,
      tokenHash: createHash("sha256").update(rawToken, "utf8").digest("hex"),
      itemOrder: ITEMS.map((item) => item.id),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  return { rawToken, inviteId: invite.id };
}

async function savedCode(inviteId: number) {
  const row = await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: inviteId }, select: { answers: true } });
  return ((row.answers ?? {}) as Record<string, string>)[CODING_ID] ?? null;
}

function editor(page: Page) {
  return page.locator("li", { has: page.locator(".monaco-editor") });
}

async function editorText(page: Page) {
  const text = await editor(page).locator(".view-lines").innerText();
  return text.replace(/\u00a0/g, " ").trim();
}

async function start(page: Page, rawToken: string) {
  await page.goto(`/assess/${rawToken}`);
  await page.getByRole("button", { name: "Start the assessment" }).click();
  await expect(editor(page).locator(".monaco-editor .view-lines")).toBeVisible({ timeout: 30_000 });
}

async function focusEditorEnd(page: Page) {
  await editor(page).locator(".view-lines").click();
  await page.keyboard.press("ControlOrMeta+End");
}

test.beforeAll(async () => {
  const company = await prisma.company.create({
    data: { name: `${MARKER} co`, industry: "Test", employees: 1, publicSlug: MARKER },
  });
  companyId = company.id;
  const job = await prisma.job.create({ data: { title: `${MARKER} role`, status: "OPEN", companyId } });
  jobId = job.id;
  await prisma.generatedAssessment.create({
    data: { jobId, companyId, version: 1, status: "PUBLISHED", publishedAt: new Date(), timeLimitMinutes: LIMIT_MINUTES, drawCount: ITEMS.length, items: ITEMS },
  });
});

test.afterAll(async () => {
  // The audit log is append-only, so the synthetic company, job and candidates stay behind under MARKER.
  if (companyId) {
    await prisma.generatedAssessmentInvite.deleteMany({ where: { assessment: { companyId } } });
    await prisma.generatedAssessment.deleteMany({ where: { companyId } });
  }
  await prisma.$disconnect();
});

test("types, edits, deletes, autosaves, restores after refresh, survives going offline, and submits", async ({ page, context }) => {
  test.setTimeout(150_000);
  const { rawToken, inviteId } = await newInvite("main");
  await start(page, rawToken);

  await focusEditorEnd(page);
  await page.keyboard.type("function add(a, b) { return a + b; }");
  await expect.poll(() => editorText(page)).toBe("function add(a, b) { return a + b; }");

  await page.keyboard.press("End");
  for (let index = 0; index < 3; index += 1) await page.keyboard.press("Backspace");
  await page.keyboard.type(" * 2; }");
  const edited = "function add(a, b) { return a + b * 2; }";
  await expect.poll(() => editorText(page)).toBe(edited);
  await expect.poll(() => savedCode(inviteId), { timeout: 15_000 }).toBe(edited);
  await expect(page.getByText(/Saved at/)).toBeVisible();

  await page.keyboard.type(" // before refresh");
  await page.reload();
  const beforeRefresh = `${edited} // before refresh`;
  await expect.poll(() => savedCode(inviteId), { timeout: 10_000 }).toBe(beforeRefresh);
  await expect(editor(page).locator(".view-lines")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => editorText(page)).toBe(beforeRefresh);

  await context.setOffline(true);
  await focusEditorEnd(page);
  await page.keyboard.type(" // offline");
  await expect(page.getByText(/Could not save/)).toBeVisible({ timeout: 10_000 });
  expect(await savedCode(inviteId)).toBe(beforeRefresh);
  await context.setOffline(false);
  const afterOffline = `${beforeRefresh} // offline`;
  await expect.poll(() => savedCode(inviteId), { timeout: 15_000 }).toBe(afterOffline);

  await page.getByRole("button", { name: "Submit final answers" }).click();
  await expect(page.getByRole("heading", { name: "Assessment submitted" })).toBeVisible({ timeout: 20_000 });
  const submitted = await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: inviteId } });
  expect(submitted.submittedAt).not.toBeNull();
  expect((submitted.answers as Record<string, string>)[CODING_ID]).toBe(afterOffline);
  expect(await prisma.aIRun.count({ where: { companyId } })).toBe(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Assessment submitted" })).toBeVisible();
  await expect(page.locator(".monaco-editor")).toHaveCount(0);
});

test("submits the saved code when the timer runs out, and the server refuses saves after the grace period", async ({ page }) => {
  test.setTimeout(120_000);
  const timed = await newInvite("timer");
  await start(page, timed.rawToken);
  await focusEditorEnd(page);
  await page.keyboard.type("const answer = 42;");
  await expect.poll(() => savedCode(timed.inviteId), { timeout: 15_000 }).toBe("const answer = 42;");

  await prisma.generatedAssessmentInvite.update({
    where: { id: timed.inviteId },
    data: { startedAt: new Date(Date.now() - (LIMIT_MINUTES * 60_000 - 5_000)) },
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Assessment submitted" })).toBeVisible({ timeout: 30_000 });
  const done = await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: timed.inviteId } });
  expect(done.submittedAt).not.toBeNull();
  expect((done.answers as Record<string, string>)[CODING_ID]).toBe("const answer = 42;");

  const late = await newInvite("late");
  await start(page, late.rawToken);
  await prisma.generatedAssessmentInvite.update({
    where: { id: late.inviteId },
    data: { startedAt: new Date(Date.now() - (LIMIT_MINUTES * 60_000 + 2 * 60_000)) },
  });
  const refused = await page.evaluate(async (token) => {
    const response = await fetch(`/api/assess/${token}/generated`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: { [`code-1`]: "too late" } }),
    });
    return { status: response.status, body: await response.json() };
  }, late.rawToken);
  expect(refused.status).toBe(409);
  expect(refused.body.code).toBe("TIME_UP");
  expect(await savedCode(late.inviteId)).toBeNull();
});

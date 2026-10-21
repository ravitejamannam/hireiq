import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";

import { hashPassword } from "../lib/auth/password";
import { prisma } from "../lib/prisma";
import { assertE2eDatabase } from "../lib/testing/e2e-database-guard";

assertE2eDatabase();

const MARKER = `sched-e2e-${Date.now()}`;
const PASSWORD = "E2e-schedule-pass-1";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByPlaceholder("you@company.com").fill(email);
  await page.getByPlaceholder("Enter your password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

let interviewerAEmail = "";
let interviewerBEmail = "";
let companyId = 0;
const interviewerProfileIds: number[] = [];

test.beforeAll(async () => {
  assertE2eDatabase();
  const passwordHash = await hashPassword(PASSWORD);
  const company = await prisma.company.create({ data: { name: MARKER, industry: "T", employees: 2, publicSlug: MARKER } });
  companyId = company.id;
  const profileA = await prisma.interviewer.create({ data: { name: `${MARKER} A`, category: "ENGINEERING" } });
  const profileB = await prisma.interviewer.create({ data: { name: `${MARKER} B`, category: "ENGINEERING" } });
  interviewerProfileIds.push(profileA.id, profileB.id);
  interviewerAEmail = `${MARKER}-a@hireiq.test`;
  interviewerBEmail = `${MARKER}-b@hireiq.test`;
  await prisma.user.create({ data: { email: interviewerAEmail, name: "Interviewer A", role: "INTERVIEWER", passwordHash, emailVerifiedAt: new Date(), interviewerId: profileA.id } });
  await prisma.user.create({ data: { email: interviewerBEmail, name: "Interviewer B", role: "INTERVIEWER", passwordHash, emailVerifiedAt: new Date(), interviewerId: profileB.id } });
  const jobA = await prisma.job.create({ data: { title: `${MARKER} role A`, status: "OPEN", companyId: company.id, assignedInterviewerId: profileA.id } });
  const jobB = await prisma.job.create({ data: { title: `${MARKER} role B`, status: "OPEN", companyId: company.id, assignedInterviewerId: profileB.id } });

  const makeApp = async (jobId: number, name: string) => {
    const candidate = await prisma.candidate.create({ data: { name, role: "Eng", experienceYears: 1, status: "APPLIED", companyId: company.id } });
    return prisma.application.create({
      data: { candidateId: candidate.id, jobId, companyId: company.id, status: "TECH_EVALUATION", statusTokenHash: createHash("sha256").update(`${name}-${Date.now()}`).digest("hex") },
    });
  };
  const appA = await makeApp(jobA.id, `${MARKER} cand A`);
  const appB = await makeApp(jobB.id, `${MARKER} cand B`);

  await prisma.interview.create({ data: { type: "TECHNICAL", interviewAt: new Date(Date.now() + 1 * 86_400_000), result: "PENDING", meetUrl: "https://meet.example.com/tech", applicationId: appA.id } });
  await prisma.interview.create({ data: { type: "PHONE_SCREEN", interviewAt: new Date(Date.now() + 3 * 86_400_000), result: "PENDING", applicationId: appA.id } });
  await prisma.interview.create({ data: { type: "PHONE_SCREEN", interviewAt: new Date(Date.now() - 5 * 86_400_000), result: "PASSED", applicationId: appA.id } });
  await prisma.interview.create({ data: { type: "HR", interviewAt: new Date(Date.now() + 2 * 86_400_000), result: "PENDING", applicationId: appB.id } });
});

test.afterAll(async () => {
  assertE2eDatabase();
  if (!companyId) return;
  const interviews = await prisma.interview.findMany({ where: { application: { job: { companyId } } }, select: { id: true } });
  await prisma.interviewReminder.deleteMany({ where: { interviewId: { in: interviews.map((r) => r.id) } } });
  await prisma.interview.deleteMany({ where: { id: { in: interviews.map((r) => r.id) } } });
  await prisma.application.deleteMany({ where: { job: { companyId } } });
  await prisma.candidate.deleteMany({ where: { companyId } });
  await prisma.job.deleteMany({ where: { companyId } });
  const emails = [interviewerAEmail, interviewerBEmail].filter((email) => email.length > 0);
  if (emails.length > 0) await prisma.user.deleteMany({ where: { email: { in: emails } } });
  if (interviewerProfileIds.length > 0) await prisma.interviewer.deleteMany({ where: { id: { in: interviewerProfileIds } } });
  await prisma.company.delete({ where: { id: companyId } });
});

test("unauthenticated access follows the existing login redirect", async ({ page }) => {
  await page.goto("/interviewer/interviews");
  await expect(page).toHaveURL(/\/login/);
});

test("an interviewer sees their own upcoming interviews ordered by time, with meeting links", async ({ page }) => {
  await signIn(page, interviewerAEmail);
  await page.goto("/interviewer/interviews");
  await expect(page.getByRole("heading", { name: "My interviews" })).toBeVisible();

  const upcoming = page.locator("section").filter({ hasText: "Upcoming" }).locator("li");
  await expect(upcoming).toHaveCount(2);
  // Soonest first, with candidate, job, type badge, and meeting link.
  await expect(upcoming.nth(0)).toContainText("cand A");
  await expect(upcoming.nth(0)).toContainText("role A");
  await expect(upcoming.nth(0)).toContainText("Technical");
  await expect(upcoming.nth(0).getByRole("link", { name: "Open meeting link" })).toHaveAttribute("href", "https://meet.example.com/tech");
  await expect(upcoming.nth(1)).toContainText("Phone screen");
  await expect(upcoming.nth(0)).toContainText(/am|pm/i);

  // Recent past shows the held interview with its result.
  const past = page.locator("section").filter({ hasText: "Recent past" }).locator("li");
  await expect(past).toHaveCount(1);
  await expect(past.nth(0)).toContainText("Passed");

  // The sidebar exposes the page.
  await expect(page.getByRole("link", { name: "My interviews" })).toBeVisible();
});

test("an interviewer cannot see another interviewer's interviews", async ({ page }) => {
  await signIn(page, interviewerBEmail);
  await page.goto("/interviewer/interviews");
  await expect(page.getByRole("heading", { name: "My interviews" })).toBeVisible();
  const upcoming = page.locator("section").filter({ hasText: "Upcoming" }).locator("li");
  await expect(upcoming).toHaveCount(1);
  await expect(upcoming.nth(0)).toContainText("cand B");
  await expect(upcoming.nth(0)).toContainText("role B");
  await expect(upcoming.nth(0)).toContainText("HR");
  await expect(page.getByText("cand A")).toHaveCount(0);
  await expect(page.getByText("role A")).toHaveCount(0);
});

test("an interviewer with no interviews sees the empty state", async ({ page }) => {
  assertE2eDatabase();
  const passwordHash = await hashPassword(PASSWORD);
  const emptyProfile = await prisma.interviewer.create({ data: { name: `${MARKER} empty`, category: "ENGINEERING" } });
  const emptyEmail = `${MARKER}-empty@hireiq.test`;
  await prisma.user.create({ data: { email: emptyEmail, name: "Interviewer C", role: "INTERVIEWER", passwordHash, emailVerifiedAt: new Date(), interviewerId: emptyProfile.id } });
  try {
    await signIn(page, emptyEmail);
    await page.goto("/interviewer/interviews");
    await expect(page.getByText("Nothing scheduled. Booked interviews appear here with their meeting links.")).toBeVisible();
    await expect(page.getByText("No past interviews yet.")).toBeVisible();
  } finally {
    await prisma.user.deleteMany({ where: { email: emptyEmail } });
    await prisma.interviewer.delete({ where: { id: emptyProfile.id } });
  }
});

import { randomBytes, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { JobSpecificationVersionStatus, PortalRole } from "@prisma/client";

import { deleteAuditLogsForTests } from "../lib/audit/write-audit-log";
import { hashPassword } from "../lib/auth/password";
import { generateSecureToken } from "../lib/auth/secure-token";
import { PORTAL_LINK_TTL_MS } from "../lib/portal/candidate-portal";
import { prisma } from "../lib/prisma";
import { approveCloseOut, proposeCloseOut } from "../lib/screening/close-out-service";
import { assertE2eDatabase } from "../lib/testing/e2e-database-guard";

assertE2eDatabase();

const marker = `sie2e${randomUUID().replace(/-/g, "").slice(0, 12)}`;

type SignedInFixtures = {
  adminEmail: string;
  interviewerEmail: string;
  password: string;
  reviewJobId: number;
  reviewJobTitle: string;
  otherJobId: number;
  applicationId: number;
  otherInterviewerEmail: string;
  otherInterviewerJobId: number;
  otherInterviewerApplicationId: number;
  portalUrl: string | null;
  humanReviewUrl: string | null;
  portalEmail: string;
  foreignApplicationId: number;
  scoreTargetId: number;
  scoreSpareId: number;
  scoreCaptureId: number;
  advanceName: string;
  closeoutName: string;
  shortlistName: string;
  shortlistHoldName: string;
  cancelName: string;
  humanReviewName: string;
  humanControlName: string;
};

const owned = {
  companyIds: [] as number[],
  userIds: [] as number[],
  interviewerIds: [] as number[],
  portalEmails: [] as string[],
};

let fixture: SignedInFixtures | null = null;

function fx() {
  if (!fixture) throw new Error("Signed-in fixtures were not created.");
  return fixture;
}

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByPlaceholder("you@company.com").fill(email);
  await page.getByPlaceholder("Enter your password").fill(fx().password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Same storage contract as issuePortalLink, without importing the portal service. */
async function ownedPortalPath(email: string) {
  const known = await prisma.candidatePortalIdentity.findFirst({
    where: { emailNormalized: email },
    select: { id: true },
  });
  if (!known) return null;
  const token = generateSecureToken();
  await prisma.portalLoginLink.create({
    data: {
      emailNormalized: email,
      tokenHash: token.tokenHash,
      expiresAt: new Date(Date.now() + PORTAL_LINK_TTL_MS),
    },
  });
  return `/portal/enter/${token.rawToken}`;
}

test.beforeAll(async () => {
  assertE2eDatabase();
  const password = `Owned-${randomBytes(9).toString("base64url")}`;
  const passwordHash = await hashPassword(password);

  async function company(label: string) {
    const created = await prisma.company.create({
      data: { name: `${marker} ${label}`, industry: "Software", employees: 2, publicSlug: `${marker}-${label}`.slice(0, 60) },
    });
    owned.companyIds.push(created.id);
    return created;
  }

  async function interviewer(label: string) {
    const created = await prisma.interviewer.create({ data: { name: `${marker} ${label}`, category: "ENGINEERING" } });
    owned.interviewerIds.push(created.id);
    return created;
  }

  async function user(email: string, role: "ADMIN" | "INTERVIEWER", companyId: number | null, interviewerId: number | null) {
    const created = await prisma.user.create({
      data: {
        email,
        name: email,
        role: role === "ADMIN" ? PortalRole.ADMIN : PortalRole.INTERVIEWER,
        companyId,
        interviewerId,
        passwordHash,
        emailVerifiedAt: new Date(),
      },
    });
    owned.userIds.push(created.id);
    return created;
  }

  async function specification(jobId: number, title: string) {
    const created = await prisma.jobSpecificationVersion.create({
      data: { jobId, versionNumber: 1, status: JobSpecificationVersionStatus.PUBLISHED, title, publishedAt: new Date() },
    });
    await prisma.job.update({ where: { id: jobId }, data: { currentPublishedSpecificationVersionId: created.id } });
    return created.id;
  }

  async function applicant(input: { companyId: number; jobId: number; specId: number; name: string; email?: string; portal?: boolean }) {
    const candidate = await prisma.candidate.create({
      data: { name: input.name, role: "Engineer", experienceYears: 3, status: "APPLIED", companyId: input.companyId },
    });
    const application = await prisma.application.create({
      data: { candidateId: candidate.id, jobId: input.jobId, companyId: input.companyId, status: "CV_POOL" },
    });
    if (input.email) {
      await prisma.applicationIngestionEvent.create({
        data: {
          companyId: input.companyId,
          jobId: input.jobId,
          applicationId: application.id,
          candidateId: candidate.id,
          sourceChannel: "MANUAL",
          jobSpecificationVersionId: input.specId,
          status: "PROCESSED",
          applicantName: input.name,
          applicantEmailNormalized: input.email,
        },
      });
    }
    if (input.portal && input.email) {
      await prisma.candidatePortalIdentity.create({
        data: { emailNormalized: input.email, candidateId: candidate.id, companyId: input.companyId },
      });
      owned.portalEmails.push(input.email);
    }
    return application.id;
  }

  const primary = await company("primary");
  const foreign = await company("foreign");
  const lead = await interviewer("lead");
  const otherLead = await interviewer("other");
  const foreignLead = await interviewer("foreign");
  const adminEmail = `${marker}-admin@example.test`;
  const interviewerEmail = `${marker}-lead@example.test`;
  const otherInterviewerEmail = `${marker}-other@example.test`;
  const admin = await user(adminEmail, "ADMIN", primary.id, null);
  await prisma.organizationMember.create({
    data: { companyId: primary.id, userId: admin.id, role: "OWNER", status: "ACTIVE" },
  });
  await user(interviewerEmail, "INTERVIEWER", null, lead.id);
  await user(otherInterviewerEmail, "INTERVIEWER", null, otherLead.id);
  await user(`${marker}-foreign@example.test`, "INTERVIEWER", null, foreignLead.id);

  const reviewJobTitle = `${marker} Backend Engineer`;
  const reviewJob = await prisma.job.create({
    data: { title: reviewJobTitle, status: "OPEN", companyId: primary.id, assignedInterviewerId: lead.id },
  });
  const otherInterviewerJob = await prisma.job.create({
    data: { title: `${marker} other assignment`, status: "OPEN", companyId: primary.id, assignedInterviewerId: otherLead.id },
  });
  const foreignJob = await prisma.job.create({
    data: { title: `${marker} foreign role`, status: "OPEN", companyId: foreign.id, assignedInterviewerId: foreignLead.id },
  });
  const reviewSpecId = await specification(reviewJob.id, reviewJobTitle);
  const foreignSpecId = await specification(foreignJob.id, foreignJob.title);
  const otherSpecId = await specification(otherInterviewerJob.id, otherInterviewerJob.title);

  const named = async (label: string, email = false, portal = false) =>
    applicant({
      companyId: primary.id,
      jobId: reviewJob.id,
      specId: reviewSpecId,
      name: `${marker} ${label}`,
      email: email || portal ? `${marker}-${label}@example.test` : undefined,
      portal,
    });

  const scoreTargetId = await named("score");
  const scoreSpareId = await named("spare");
  const scoreCaptureId = await named("capture");
  const advanceName = `${marker} advance`;
  await named("advance");
  const closeoutName = `${marker} closeout`;
  await named("closeout", true);
  const shortlistName = `${marker} shortlist`;
  await named("shortlist", true);
  const shortlistHoldName = `${marker} hold`;
  await named("hold");
  const cancelName = `${marker} cancel`;
  await named("cancel", true);
  const humanReviewName = `${marker} portal`;
  const portalEmail = `${marker}-portal@example.test`;
  await applicant({
    companyId: primary.id,
    jobId: reviewJob.id,
    specId: reviewSpecId,
    name: humanReviewName,
    email: portalEmail,
    portal: true,
  });
  const humanControlName = `${marker} control`;
  await named("control", true);
  await named("queuea");
  await named("queueb");
  const otherInterviewerApplicationId = await applicant({
    companyId: primary.id,
    jobId: otherInterviewerJob.id,
    specId: otherSpecId,
    name: `${marker} elsewhere`,
  });
  const foreignApplicationId = await applicant({
    companyId: foreign.id,
    jobId: foreignJob.id,
    specId: foreignSpecId,
    name: `${marker} foreign applicant`,
    email: `${marker}-foreign-applicant@example.test`,
  });
  const portalUrl = await ownedPortalPath(portalEmail);
  const humanReviewUrl = await ownedPortalPath(portalEmail);

  fixture = {
    adminEmail,
    interviewerEmail,
    password,
    reviewJobId: reviewJob.id,
    reviewJobTitle,
    otherJobId: foreignJob.id,
    applicationId: scoreTargetId,
    otherInterviewerEmail,
    otherInterviewerJobId: otherInterviewerJob.id,
    otherInterviewerApplicationId,
    portalUrl,
    humanReviewUrl,
    portalEmail,
    foreignApplicationId,
    scoreTargetId,
    scoreSpareId,
    scoreCaptureId,
    advanceName,
    closeoutName,
    shortlistName,
    shortlistHoldName,
    cancelName,
    humanReviewName,
    humanControlName,
  };
});

test.afterAll(async () => {
  const companyIds = owned.companyIds.filter((id) => id > 0);
  const userIds = owned.userIds.filter((id) => id > 0);
  const interviewerIds = owned.interviewerIds.filter((id) => id > 0);
  const portalEmails = owned.portalEmails.filter((email) => email.length > 0);
  if (companyIds.length === 0 && userIds.length === 0 && interviewerIds.length === 0 && portalEmails.length === 0) return;
  try {
    if (companyIds.length > 0) {
      await prisma.evaluation.deleteMany({ where: { application: { companyId: { in: companyIds } } } });
      await prisma.interviewSlot.deleteMany({ where: { job: { companyId: { in: companyIds } } } });
      await prisma.closeOutBatch.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.outcomeEvent.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.decisionRecord.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.outboundEmailAttempt.deleteMany({ where: { companyId: { in: companyIds } } });
      await deleteAuditLogsForTests({ companyId: { in: companyIds } });
      await prisma.applicationIngestionEvent.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.candidatePortalIdentity.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.job.updateMany({
        where: { companyId: { in: companyIds } },
        data: { currentPublishedSpecificationVersionId: null },
      });
      await prisma.jobSpecificationVersion.deleteMany({ where: { job: { companyId: { in: companyIds } } } });
      await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.organizationMember.deleteMany({ where: { companyId: { in: companyIds } } });
    }
    if (portalEmails.length > 0) {
      await prisma.portalLoginLink.deleteMany({ where: { emailNormalized: { in: portalEmails } } });
    }
    if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (interviewerIds.length > 0) await prisma.interviewer.deleteMany({ where: { id: { in: interviewerIds } } });
    if (companyIds.length > 0) await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  } catch (error) {
    console.error("signed-in fixture cleanup failed", { companyIds, userIds, interviewerIds });
    throw error;
  }
});

test("company admin can use the review queue and cannot open the other company", async ({ page }) => {
  await signIn(page, fx().adminEmail);
  // The default "top" view only lists applicants with a complete, ranked result. Seeded applicants have no
  // assessment results yet, so the "all" view is the one that exposes them.
  await page.goto(`/dashboard/jobs/${fx().reviewJobId}/review`);
  await expect(page.getByRole("heading", { name: /Backend Engineer/ })).toBeVisible();
  await expect(page.getByText(/^0 in this view/)).toBeVisible();

  await page.goto(`/dashboard/jobs/${fx().reviewJobId}/review?view=all`);
  await expect(page.getByRole("heading", { name: /Backend Engineer/ })).toBeVisible();
  const rowChecks = page.getByRole("checkbox", { name: /^Select / });
  await expect(rowChecks.first()).toBeVisible();
  expect(await rowChecks.count()).toBeGreaterThan(1);

  // "j" moves to the next row and records it in the URL.
  await page.locator("[tabindex='0']").first().focus();
  await page.keyboard.press("j");
  await expect(page).toHaveURL(/selected=\d+/);

  // Ticking a row enables the bulk actions. They are not clicked: Advance mutates the pipeline, so that step
  // needs its own run on a database that may be changed.
  // The side panel has its own per-applicant "Advance"; the bulk toolbar button is the first in the DOM.
  const advance = page.getByRole("button", { name: "Advance" }).first();
  await expect(advance).toBeDisabled();
  await rowChecks.first().check();
  await expect(advance).toBeEnabled();

  const foreign = await page.goto(`/dashboard/jobs/${fx().otherJobId}/review`);
  expect(foreign?.status()).toBe(404);
});

test("interviewer can open a scorecard for their job", async ({ page }) => {
  await signIn(page, fx().interviewerEmail);
  const response = await page.goto(`/interviewer/requirements/${fx().reviewJobId}/candidates/${fx().applicationId}`);
  expect(response?.status()).toBeLessThan(500);
  await expect(page.getByText(/score|rubric|feedback/i).first()).toBeVisible();
});

/**
 * STATE-CHANGING. Contract (app/actions/evaluation-actions.ts submitRubricScorecard, called by RubricScorecardForm):
 * the session must be an interviewer whose profile is Job.assignedInterviewerId for the application's job; every score
 * is an integer 1..5; the action upserts Evaluation(applicationId, interviewerId) with scorecard, overallScore (rounded
 * mean), notes, submittedAt and evaluatedAt. The same transaction writes one SCORECARD_SUBMITTED audit row naming the
 * interviewer, the application's company, and the application. Scores are not copied into the audit row. It sends no
 * email (there is no Interview link: "assigned" means the job's assigned interviewer). Resubmission overwrites by
 * design (upsert), so it is not asserted to fail. Negative cases replay the real Next server-action request captured
 * from the UI, so the server-side path is the one that refuses.
 */
test("assigned interviewer submits a scorecard; foreign, invalid and anonymous submissions are refused", async ({ page, playwright, baseURL }) => {
  assertE2eDatabase();
  const me = await prisma.user.findUniqueOrThrow({ where: { email: fx().interviewerEmail }, select: { id: true, interviewerId: true } });
  expect(me.interviewerId).not.toBeNull();
  const job = await prisma.job.findUniqueOrThrow({ where: { id: fx().reviewJobId }, select: { id: true, companyId: true, assignedInterviewerId: true } });
  expect(job.assignedInterviewerId).toBe(me.interviewerId);

  const target = await prisma.application.findUniqueOrThrow({
    where: { id: fx().scoreTargetId },
    select: { id: true, status: true, companyId: true, jobId: true },
  });
  const spare = await prisma.application.findUniqueOrThrow({
    where: { id: fx().scoreSpareId },
    select: { id: true, status: true, companyId: true, jobId: true },
  });
  expect(target).toMatchObject({ companyId: job.companyId, jobId: job.id, status: "CV_POOL" });
  expect(spare).toMatchObject({ companyId: job.companyId, jobId: job.id, status: "CV_POOL" });
  const foreignApp = await prisma.application.findUniqueOrThrow({
    where: { id: fx().foreignApplicationId },
    select: { id: true, companyId: true, status: true, job: { select: { assignedInterviewerId: true } } },
  });
  expect(foreignApp.companyId).not.toBe(job.companyId);
  expect(foreignApp.job.assignedInterviewerId).not.toBe(me.interviewerId);
  const sameCompanyOther = { id: fx().otherInterviewerApplicationId };

  const snapshot = async () => ({
    evaluations: JSON.stringify(await prisma.evaluation.findMany({ orderBy: { id: "asc" } })),
    applications: JSON.stringify(await prisma.application.findMany({ select: { id: true, status: true, updatedAt: true }, orderBy: { id: "asc" } })),
    interviews: await prisma.interview.count(),
    emails: await prisma.outboundEmailAttempt.count(),
  });
  const scorecardAudits = () =>
    prisma.auditLog.findMany({
      where: { companyId: job.companyId, targetType: "APPLICATION", targetId: target.id, action: "SCORECARD_SUBMITTED" },
      orderBy: { id: "asc" },
    });
  const before = await snapshot();
  const mineBefore = await prisma.evaluation.count({ where: { applicationId: target.id } });
  expect(mineBefore).toBe(0);
  expect(await scorecardAudits()).toEqual([]);

  await signIn(page, fx().interviewerEmail);
  let action: { url: string; id: string; body: string } | null = null;
  page.on("request", (request) => {
    const id = request.headers()["next-action"];
    if (id && request.method() === "POST" && request.postData()?.includes('"scores"')) action = { url: request.url(), id, body: request.postData()! };
  });
  await page.goto(`/interviewer/requirements/${job.id}/candidates/${target.id}`);
  const scoreInputs = page.getByRole("spinbutton", { name: /^Score for / });
  const count = await scoreInputs.count();
  expect(count).toBeGreaterThan(0);
  const labels: string[] = [];
  const given: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const value = (index % 5) + 1;
    labels.push((await scoreInputs.nth(index).getAttribute("aria-label"))!.replace(/^Score for /, ""));
    given.push(value);
    await scoreInputs.nth(index).fill(String(value));
  }
  const notes = `E2E scorecard notes ${Date.now()}`;
  await page.getByLabel("Scorecard notes").fill(notes);
  await page.getByRole("button", { name: "Submit scorecard" }).click();
  await expect(page.getByText(/Scorecard submitted\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit scorecard" })).toHaveCount(0);

  const stored = await prisma.evaluation.findMany({ where: { applicationId: target.id }, include: { application: { select: { jobId: true, companyId: true } } } });
  expect(stored).toHaveLength(1);
  const evaluation = stored[0]!;
  expect(evaluation.interviewerId).toBe(me.interviewerId);
  // An interviewer has no company of its own (User.companyId is null): ownership is the job's company, reached through
  // the application, and the candidate must belong to the same company.
  expect(evaluation.application).toEqual({ jobId: job.id, companyId: job.companyId });
  expect((await prisma.application.findUniqueOrThrow({ where: { id: target.id }, select: { candidate: { select: { companyId: true } } } })).candidate.companyId).toBe(job.companyId);
  expect(evaluation.submittedAt).not.toBeNull();
  expect(evaluation.evaluatedAt).not.toBeNull();
  expect(evaluation.notes).toBe(notes);
  expect(evaluation.scorecard).toEqual(labels.map((criterion, index) => ({ criterion, score: given[index] })));
  expect(evaluation.overallScore).toBe(Math.round(given.reduce((sum, value) => sum + value, 0) / given.length));

  // Nothing but this evaluation and its audit row changed: no other evaluation, application, interview, or email attempt.
  const afterSubmit = await snapshot();
  expect(afterSubmit.applications).toBe(before.applications);
  expect(afterSubmit.interviews).toBe(before.interviews);
  expect(afterSubmit.emails).toBe(before.emails);
  const submittedAudits = await scorecardAudits();
  expect(submittedAudits).toHaveLength(1);
  expect(submittedAudits[0]).toMatchObject({
    actorUserId: me.id,
    actorRole: "INTERVIEWER",
    companyId: job.companyId,
    action: "SCORECARD_SUBMITTED",
    targetType: "APPLICATION",
    targetId: target.id,
    reason: null,
    scimTokenId: null,
  });
  expect(await prisma.auditLog.count({
    where: { companyId: job.companyId, targetType: "APPLICATION", targetId: target.id, action: { not: "SCORECARD_SUBMITTED" } },
  })).toBe(0);
  const others = (rows: string) => (JSON.parse(rows) as Array<{ id: number }>).filter((row) => row.id !== evaluation.id);
  expect(others(afterSubmit.evaluations)).toEqual(others(before.evaluations));

  // Replay the genuine server-action request with other arguments.
  expect(action).not.toBeNull();
  const captured = action!;
  const replay = (ctx: { post: typeof page.request.post }, input: unknown) =>
    ctx.post(captured.url, { headers: { "Next-Action": captured.id, "Content-Type": "text/plain;charset=UTF-8" }, data: JSON.stringify([input]) });
  const valid = (applicationId: number) => ({ applicationId, scores: labels.map((criterion) => ({ criterion, score: 3 })), notes: "should never be stored" });
  const settled = await snapshot();

  const refusals: Array<[string, number, unknown]> = [
    ["foreign company application", foreignApp.id, valid(foreignApp.id)],
    ["score above range", spare.id, { ...valid(spare.id), scores: labels.map((criterion) => ({ criterion, score: 9 })) }],
    ["score below range", spare.id, { ...valid(spare.id), scores: labels.map((criterion) => ({ criterion, score: 0 })) }],
    ["non-integer score", spare.id, { ...valid(spare.id), scores: labels.map((criterion) => ({ criterion, score: 2.5 })) }],
  ];
  refusals.push(["same-company job assigned to another interviewer", sameCompanyOther.id, valid(sameCompanyOther.id)]);
  for (const [label, applicationId, input] of refusals) {
    const response = await replay(page.request, input);
    const body = await response.text();
    test.info().annotations.push({ type: "refused", description: `${label}: ${response.status()}` });
    // A thrown server action is not a success: it never returns the action's normal (undefined) result with 200.
    expect(response.status() === 200 && !body.includes('"digest"') && !body.includes("Error"), `${label} was accepted`).toBe(false);
    expect(await prisma.evaluation.count({ where: { applicationId, interviewerId: me.interviewerId! } }), label).toBe(0);
  }
  const anonymous = await playwright.request.newContext({ baseURL });
  const anon = await replay(anonymous, valid(spare.id));
  // The proxy sends an unauthenticated request to /login (the redirect is followed), or the action itself throws.
  test.info().annotations.push({ type: "anonymous replay", description: `${anon.status()} ${new URL(anon.url()).pathname}` });
  expect(anon.status() >= 400 || new URL(anon.url()).pathname === "/login", "anonymous submission was accepted").toBe(true);
  await anonymous.dispose();

  const afterRefusals = await snapshot();
  expect(afterRefusals).toEqual(settled);
  expect(await scorecardAudits()).toHaveLength(1);
  expect(await prisma.auditLog.findMany({
    where: { targetType: "APPLICATION", targetId: { in: [foreignApp.id, spare.id, sameCompanyOther.id] } },
    select: { action: true, companyId: true, targetId: true },
  })).toEqual([]);
});

/**
 * Isolates the assignment rule from tenant isolation: the target application is in the interviewer's own company, but
 * its job is assigned to a different interviewer. submitRubricScorecard authorizes on
 * Application.job.assignedInterviewerId === session interviewer, so company membership alone must not be enough.
 * The real server action is replayed: its id is learned from the genuine form submit on an own-job application, which is
 * aborted in the browser so nothing is written, then the same request is sent with the target's application id.
 * The allowed case is covered by the "assigned interviewer submits a scorecard" test above.
 */
test("interviewer cannot submit a scorecard for a same-company job assigned to a different interviewer", async ({ page }) => {
  assertE2eDatabase();
  const a = await prisma.user.findUniqueOrThrow({ where: { email: fx().interviewerEmail }, select: { id: true, interviewerId: true } });
  const b = await prisma.user.findUniqueOrThrow({ where: { email: fx().otherInterviewerEmail }, select: { id: true, interviewerId: true } });
  expect(a.id).not.toBe(b.id);
  expect(a.interviewerId).not.toBeNull();
  expect(b.interviewerId).not.toBeNull();
  expect(a.interviewerId).not.toBe(b.interviewerId);

  const own = await prisma.job.findUniqueOrThrow({ where: { id: fx().reviewJobId }, select: { companyId: true, assignedInterviewerId: true } });
  const target = await prisma.application.findUniqueOrThrow({
    where: { id: fx().otherInterviewerApplicationId },
    select: { id: true, companyId: true, jobId: true, job: { select: { companyId: true, assignedInterviewerId: true } }, candidate: { select: { companyId: true } } },
  });
  expect(own.assignedInterviewerId).toBe(a.interviewerId);
  expect(target.jobId).toBe(fx().otherInterviewerJobId);
  expect(target.job.assignedInterviewerId).toBe(b.interviewerId);
  expect(target.job.assignedInterviewerId).not.toBe(a.interviewerId);
  expect(target.companyId).toBe(own.companyId);
  expect(target.job.companyId).toBe(own.companyId);
  expect(target.candidate.companyId).toBe(own.companyId);

  const snapshot = async () => ({
    evaluations: JSON.stringify(await prisma.evaluation.findMany({ orderBy: { id: "asc" } })),
    applications: JSON.stringify(await prisma.application.findMany({ select: { id: true, status: true, updatedAt: true }, orderBy: { id: "asc" } })),
    interviews: await prisma.interview.count(),
    emails: await prisma.outboundEmailAttempt.count(),
  });
  const applicationAudits = (applicationId: number) =>
    prisma.auditLog.findMany({
      where: { companyId: own.companyId, targetType: "APPLICATION", targetId: applicationId },
      orderBy: { id: "asc" },
      select: { action: true, actorUserId: true, actorRole: true, companyId: true, targetId: true, reason: true },
    });
  expect(await prisma.evaluation.count({ where: { applicationId: target.id } })).toBe(0);
  expect(await applicationAudits(target.id)).toEqual([]);

  await signIn(page, fx().interviewerEmail);
  // The page itself refuses first: the interviewer's own job is not the target's job, and the target's job is not theirs.
  const pageResponse = await page.goto(`/interviewer/requirements/${target.jobId}/candidates/${target.id}`);
  expect(pageResponse?.status()).toBe(404);

  // Learn the real server-action id from the form on an application interviewer A is allowed to score, without
  // submitting it: intercept and abort that one request, then replay it for the target.
  const own2 = await prisma.application.findUniqueOrThrow({
    where: { id: fx().scoreCaptureId },
    select: { id: true, jobId: true, companyId: true },
  });
  expect(own2).toMatchObject({ jobId: fx().reviewJobId, companyId: own.companyId });
  expect(await prisma.evaluation.count({ where: { applicationId: own2.id } })).toBe(0);
  expect(await applicationAudits(own2.id)).toEqual([]);
  let captured: { url: string; id: string } | null = null;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const id = request.headers()["next-action"];
    if (id && request.method() === "POST" && request.postData()?.includes('"scores"')) {
      captured = { url: request.url(), id };
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto(`/interviewer/requirements/${fx().reviewJobId}/candidates/${own2.id}`);
  const scoreInputs = page.getByRole("spinbutton", { name: /^Score for / });
  const count = await scoreInputs.count();
  expect(count).toBeGreaterThan(0);
  const labels: string[] = [];
  for (let index = 0; index < count; index += 1) {
    labels.push((await scoreInputs.nth(index).getAttribute("aria-label"))!.replace(/^Score for /, ""));
    await scoreInputs.nth(index).fill("4");
  }
  await page.getByRole("button", { name: "Submit scorecard" }).click();
  await expect.poll(() => captured).not.toBeNull();
  await page.unroute("**/*");

  // The aborted form request wrote nothing; this is the baseline for the refused attempt.
  const before = await snapshot();
  const response = await page.request.post(captured!.url, {
    headers: { "Next-Action": captured!.id, "Content-Type": "text/plain;charset=UTF-8" },
    data: JSON.stringify([{ applicationId: target.id, scores: labels.map((criterion) => ({ criterion, score: 4 })), notes: "must not be stored" }]),
  });
  const body = await response.text();
  test.info().annotations.push({ type: "refused", description: `${response.status()}` });
  expect(response.status() === 200 && !body.includes('"digest"') && !body.includes("Error"), "cross-assignment submission was accepted").toBe(false);

  expect(await prisma.evaluation.count({ where: { applicationId: target.id } })).toBe(0);
  expect(await prisma.evaluation.count({ where: { applicationId: own2.id } })).toBe(0);
  expect(await applicationAudits(target.id)).toEqual([]);
  expect(await applicationAudits(own2.id)).toEqual([]);
  expect(await snapshot()).toEqual(before);
});

test("candidate portal opens from a magic link", async ({ page }) => {
  test.skip(!fx().portalUrl, "No portal link was issued");
  // The link is single-use. An invalid or expired one redirects to /portal?error=expired, so the URL, the
  // heading and the candidate-specific content below all fail on that page.
  await page.goto(fx().portalUrl!);
  await expect(page).toHaveURL(/\/portal\/home$/);
  await expect(page).not.toHaveURL(/error=/);
  await expect(page.getByRole("heading", { level: 1, name: "Your applications" })).toBeVisible();
  await expect(page.getByText(`Signed in as ${fx().portalEmail}`)).toBeVisible();
  await expect(page.getByRole("link", { name: fx().reviewJobTitle })).toBeVisible();
  await expect(page.getByText(/Current stage:/).first()).toBeVisible();
  await expect(page.getByText("That link expired")).toHaveCount(0);
});

/**
 * STATE-CHANGING: the own-company half writes one InterviewSlot row on this run's job.
 * No email or provider call happens: the route only runs createMany on InterviewSlot.
 * afterAll deletes slots on this run's jobs.
 * A foreign-company job is refused with a generic 400 ("Scheduling request failed.") because the service throws
 * JOB_NOT_FOUND; the request is otherwise valid (that job's own interviewer, a future slot), so the company check is
 * the only reason it can fail.
 */
test("company admin publishes slots for their own job and is refused another company's job", async ({ page, playwright, baseURL }) => {
  assertE2eDatabase();
  const own = await prisma.job.findUniqueOrThrow({ where: { id: fx().reviewJobId }, select: { companyId: true, assignedInterviewerId: true } });
  const foreign = await prisma.job.findUniqueOrThrow({ where: { id: fx().otherJobId }, select: { companyId: true, assignedInterviewerId: true } });
  expect(foreign.companyId).not.toBe(own.companyId);
  expect(own.assignedInterviewerId).not.toBeNull();
  expect(foreign.assignedInterviewerId).not.toBeNull();

  const slotBody = (jobId: number, interviewerId: number, startAt: Date) => ({
    jobId,
    interviewerId,
    interviewType: "TECHNICAL",
    slots: [{ startAt: startAt.toISOString(), durationMinutes: 45 }],
  });
  // Unique per run (random minute offset inside a window 30+ days out) so reruns do not collide on (interviewer, startAt).
  const unique = (offsetMinutes: number) => {
    const start = new Date(Date.now() + 30 * 86_400_000 + (Math.floor(Math.random() * 20_000) * 2 + offsetMinutes) * 60_000);
    start.setUTCSeconds(0, 0);
    return start;
  };

  // No session: refused before any work.
  const anonymous = await playwright.request.newContext({ baseURL });
  const unauth = await anonymous.post("/api/scheduling/slots", { data: slotBody(fx().reviewJobId, own.assignedInterviewerId!, unique(0)) });
  expect(unauth.status()).toBe(401);
  await anonymous.dispose();

  await signIn(page, fx().adminEmail);

  const ownStart = unique(0);
  const ownBefore = await prisma.interviewSlot.count({ where: { jobId: fx().reviewJobId } });
  const created = await page.request.post("/api/scheduling/slots", { data: slotBody(fx().reviewJobId, own.assignedInterviewerId!, ownStart) });
  expect(created.status()).toBe(200);
  expect(await created.json()).toEqual({ ok: true, created: 1 });
  const stored = await prisma.interviewSlot.findMany({ where: { jobId: fx().reviewJobId, startAt: ownStart } });
  expect(stored).toHaveLength(1);
  expect(stored[0]!.interviewerId).toBe(own.assignedInterviewerId);
  expect(await prisma.interviewSlot.count({ where: { jobId: fx().reviewJobId } })).toBe(ownBefore + 1);

  const foreignStart = unique(1);
  const foreignBefore = await prisma.interviewSlot.count({ where: { jobId: fx().otherJobId } });
  const interviewsBefore = await prisma.interview.count();
  const denied = await page.request.post("/api/scheduling/slots", { data: slotBody(fx().otherJobId, foreign.assignedInterviewerId!, foreignStart) });
  expect(denied.status()).toBe(400);
  expect(await denied.json()).toEqual({ ok: false, error: "Scheduling request failed." });
  expect(await prisma.interviewSlot.count({ where: { jobId: fx().otherJobId } })).toBe(foreignBefore);
  expect(await prisma.interviewSlot.count({ where: { startAt: foreignStart } })).toBe(0);
  expect(await prisma.interview.count()).toBe(interviewsBefore);
});

/**
 * STATE-CHANGING. Run only on a disposable database that may change (not on a database whose pipeline state is being
 * kept). Advance on a CV_POOL applicant moves it to EXPERT_REVIEW (ADVANCE map in lib/review/review-queue.ts, allowed by
 * ADMIN_PIPELINE_TRANSITIONS). The bulk action has no screening prerequisite. It writes the Application status, one
 * DecisionRecord and one AuditLog row; EXPERT_REVIEW is not an emailed stage, so no candidate email is attempted.
 */
test("company admin advances one applicant from CV pool to expert review", async ({ page }) => {
  assertE2eDatabase();
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: fx().adminEmail }, select: { companyId: true } });
  expect(admin.companyId).not.toBeNull();
  const job = await prisma.job.findUniqueOrThrow({ where: { id: fx().reviewJobId }, select: { companyId: true } });
  expect(job.companyId).toBe(admin.companyId);

  const snapshot = async () => {
    const rows = await prisma.application.findMany({ select: { id: true, status: true, updatedAt: true }, orderBy: { id: "asc" } });
    return new Map(rows.map((row) => [row.id, `${row.status}@${row.updatedAt.toISOString()}`]));
  };
  const before = await snapshot();

  const name = fx().advanceName;
  await signIn(page, fx().adminEmail);
  await page.goto(`/dashboard/jobs/${fx().reviewJobId}/review?view=all`);
  await page.getByRole("textbox", { name: "Search" }).fill(name);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/q=/);
  const rowChecks = page.getByRole("checkbox", { name: `Select ${name}` });
  await expect(rowChecks).toBeVisible();

  const matches = await prisma.application.findMany({
    where: { jobId: fx().reviewJobId, companyId: admin.companyId!, candidate: { name } },
    select: { id: true, status: true, companyId: true },
  });
  expect(matches).toHaveLength(1);
  const target = matches[0]!;
  expect(target.companyId).toBe(admin.companyId);
  expect(target.status).toBe("CV_POOL");
  const decisionsBefore = await prisma.decisionRecord.count({ where: { applicationId: target.id } });
  const auditBefore = await prisma.auditLog.count({ where: { targetType: "APPLICATION", targetId: target.id } });

  await rowChecks.first().check();
  await expect(page.getByRole("checkbox", { name: /^Select / }).and(page.locator(":checked"))).toHaveCount(1);
  // The side panel has its own per-applicant "Advance" (single decision); the bulk toolbar button is first in the DOM.
  const advance = page.getByRole("button", { name: "Advance" }).first();
  await expect(advance).toBeEnabled();
  await advance.click();

  await expect(page.getByText("1 updated.")).toBeVisible();
  await expect(page.getByText(/could not move from their current stage/)).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: name }).getByText(/expert review/i)).toBeVisible();

  const after = await prisma.application.findUniqueOrThrow({ where: { id: target.id }, select: { status: true, companyId: true } });
  expect(after.status).toBe("EXPERT_REVIEW");
  expect(after.companyId).toBe(admin.companyId);
  const decisions = await prisma.decisionRecord.findMany({ where: { applicationId: target.id }, orderBy: { id: "desc" } });
  expect(decisions).toHaveLength(decisionsBefore + 1);
  expect(decisions[0]!.rationale).toContain("advance: CV_POOL -> EXPERT_REVIEW");
  const audits = await prisma.auditLog.findMany({ where: { targetType: "APPLICATION", targetId: target.id }, orderBy: { id: "desc" } });
  expect(audits).toHaveLength(auditBefore + 1);
  expect(audits[0]).toMatchObject({ action: "APPLICATION_STAGE_CHANGED", actorRole: "ADMIN", companyId: admin.companyId });

  // Nothing else moved: every other application, in both companies, has the same status and updatedAt.
  const afterAll = await snapshot();
  expect(afterAll.size).toBe(before.size);
  const changed = [...afterAll].filter(([id, state]) => before.get(id) !== state).map(([id]) => id);
  expect(changed).toEqual([target.id]);
});

/**
 * STATE-CHANGING (disposable database only). Real workflow: select one applicant, "Reject…" -> propose close-out ->
 * type the count -> approve. The reason is one of REVIEW_REJECT_REASONS: proposeCloseOut refuses free text.
 * Writes: CloseOutBatch; AuditLog CLOSE_OUT_PROPOSED / CLOSE_OUT_APPROVED (target = batch) and APPLICATION_REJECTED
 * (target = application); Application.status/rejectionReason; DecisionRecord; OutcomeEvent. The candidate email runs
 * inside approval. With no provider keys in a non-production runtime the transport returns provider-not-configured
 * without any network call, queues no OutboundEmailAttempt, and the application records PROVIDER_NOT_CONFIGURED.
 */
test("company admin proposes and approves a close-out that rejects one applicant", async ({ page }) => {
  assertE2eDatabase();
  const reason = "Missing required skill";
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: fx().adminEmail }, select: { id: true, companyId: true } });
  expect(admin.companyId).not.toBeNull();
  const companyId = admin.companyId!;

  // Eligible: open, in the admin's company and job, no human-review request, not withdrawn, has an applicant email.
  const name = fx().closeoutName;
  const matches = await prisma.application.findMany({
    where: { jobId: fx().reviewJobId, companyId, candidate: { name } },
    select: { id: true, candidateId: true, status: true, humanReviewRequestedAt: true, withdrawnAt: true, updatedAt: true },
  });
  expect(matches).toHaveLength(1);
  const target = matches[0]!;
  expect(target.status).toBe("CV_POOL");
  expect(target.humanReviewRequestedAt).toBeNull();
  expect(target.withdrawnAt).toBeNull();

  const snapshot = async () => {
    const rows = await prisma.application.findMany({ select: { id: true, status: true, updatedAt: true }, orderBy: { id: "asc" } });
    return new Map(rows.map((row) => [row.id, `${row.status}@${row.updatedAt.toISOString()}`]));
  };
  const before = await snapshot();
  const batchesBefore = await prisma.closeOutBatch.count();
  const attemptsBefore = await prisma.outboundEmailAttempt.count();

  await signIn(page, fx().adminEmail);
  await page.goto(`/dashboard/jobs/${fx().reviewJobId}/review?view=all`);
  await page.getByRole("textbox", { name: "Search" }).fill(name);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/q=/);
  const box = page.getByRole("checkbox", { name: `Select ${name}` });
  await expect(box).toBeVisible();
  await box.check();
  await page.getByRole("button", { name: /^Reject/ }).first().click();
  await page.getByLabel("Rejection reason").selectOption(reason);
  await page.getByRole("button", { name: "Propose close-out for 1 selected" }).click();
  const region = page.getByRole("region", { name: "Approve close-out" });
  await expect(region).toContainText(`reason “${reason}”`);
  await expect(region).toContainText("1 candidate(s)");

  // Proposal alone changes nothing about the application.
  const batch = await prisma.closeOutBatch.findFirstOrThrow({
    where: { companyId, jobId: fx().reviewJobId, proposedByUserId: admin.id },
    orderBy: { id: "desc" },
  });
  expect(await prisma.closeOutBatch.count()).toBe(batchesBefore + 1);
  expect(batch).toMatchObject({ companyId, jobId: fx().reviewJobId, reason, proposedByUserId: admin.id, approvedAt: null, cancelledAt: null });
  expect(batch.applicationIds).toEqual([target.id]);
  const proposedAudit = await prisma.auditLog.findMany({ where: { action: "CLOSE_OUT_PROPOSED", targetType: "CLOSE_OUT_BATCH", targetId: batch.id } });
  expect(proposedAudit).toHaveLength(1);
  expect(proposedAudit[0]).toMatchObject({ actorUserId: admin.id, actorRole: "ADMIN", companyId });
  const stillOpen = await prisma.application.findUniqueOrThrow({ where: { id: target.id }, select: { status: true, updatedAt: true } });
  expect(stillOpen.status).toBe("CV_POOL");
  expect(stillOpen.updatedAt.toISOString()).toBe(target.updatedAt.toISOString());
  expect(await prisma.decisionRecord.count({ where: { applicationId: target.id } })).toBe(0);
  expect(await prisma.outcomeEvent.count({ where: { applicationId: target.id } })).toBe(0);

  const approve = region.getByRole("button", { name: "Approve close-out" });
  await expect(approve).toBeDisabled();
  await region.getByLabel("Type 1 to approve").fill("1");
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(page.getByRole("status")).toContainText(`1 closed with reason “${reason}”. 0 skipped. 1 candidate email(s) attempted.`);

  const rejected = await prisma.application.findUniqueOrThrow({
    where: { id: target.id },
    select: { status: true, companyId: true, rejectionReason: true, candidateStageEmailStatus: true },
  });
  expect(rejected.status).toBe("REJECTED");
  expect(rejected.companyId).toBe(companyId);
  expect(rejected.rejectionReason).toMatch(/^Missing required skill \| aiScore=(manual|\d\.\d\d)$/);

  const approved = await prisma.closeOutBatch.findUniqueOrThrow({ where: { id: batch.id } });
  expect(approved).toMatchObject({ approvedByUserId: admin.id, cancelledAt: null, result: { closed: 1, closedIds: [target.id], skipped: [] } });
  expect(approved.approvedAt).not.toBeNull();
  const approvedAudit = await prisma.auditLog.findMany({ where: { action: "CLOSE_OUT_APPROVED", targetType: "CLOSE_OUT_BATCH", targetId: batch.id } });
  expect(approvedAudit).toHaveLength(1);
  expect(approvedAudit[0]).toMatchObject({ actorUserId: admin.id, actorRole: "ADMIN", companyId, reason: "1 candidate(s)" });
  const rejectAudit = await prisma.auditLog.findMany({ where: { action: "APPLICATION_REJECTED", targetType: "APPLICATION", targetId: target.id } });
  expect(rejectAudit).toHaveLength(1);
  expect(rejectAudit[0]).toMatchObject({ actorUserId: admin.id, actorRole: "ADMIN", companyId });
  expect(rejectAudit[0]!.reason).toContain(reason);
  const decisions = await prisma.decisionRecord.findMany({ where: { applicationId: target.id } });
  expect(decisions).toHaveLength(1);
  expect(decisions[0]).toMatchObject({ companyId, decidedByUserId: admin.id });
  expect(decisions[0]!.rationale).toContain("reject: CV_POOL -> REJECTED");
  expect(decisions[0]!.rationale).toContain(`reason: ${reason}`);
  expect(decisions[0]!.rationale).toContain(`note: Close-out #${batch.id}`);
  const outcomes = await prisma.outcomeEvent.findMany({ where: { applicationId: target.id } });
  expect(outcomes).toHaveLength(1);
  expect(outcomes[0]).toMatchObject({ companyId, actorUserId: admin.id, fromStatus: "CV_POOL", toStatus: "REJECTED" });

  // Email: no provider is configured, so nothing was sent or queued; the application records why.
  expect(rejected.candidateStageEmailStatus).toBe("PROVIDER_NOT_CONFIGURED");
  expect(await prisma.outboundEmailAttempt.count()).toBe(attemptsBefore);

  // Only the target moved; the other company's applications are included in this comparison.
  const afterAll = await snapshot();
  expect(afterAll.size).toBe(before.size);
  const changed = [...afterAll].filter(([id, state]) => before.get(id) !== state).map(([id]) => id);
  expect(changed).toEqual([target.id]);
});

/**
 * STATE-CHANGING (disposable database only). Shortlist is valid only from TECH_EVALUATION (shortlistStatus in
 * lib/review/review-queue.ts). No seed produces a TECH_EVALUATION applicant, so the target is advanced twice through the
 * real bulk Advance button first (CV_POOL -> EXPERT_REVIEW -> TECH_EVALUATION), then shortlisted. A second applicant left
 * in CV_POOL is the negative case: the bulk action reports it "could not move" and writes nothing.
 * Shortlisting writes Application.status + shortlistedAt, a DecisionRecord, AuditLog APPLICATION_STAGE_CHANGED and a
 * SHORTLISTED OutcomeEvent. SHORTLISTED is an emailed stage; it is sent in the background (after()), so the stored
 * result is polled. With no provider keys in a non-production runtime it records PROVIDER_NOT_CONFIGURED, queues no
 * OutboundEmailAttempt and makes no network call.
 */
test("company admin shortlists a TECH_EVALUATION applicant and is refused for a CV pool applicant", async ({ page }) => {
  assertE2eDatabase();
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: fx().adminEmail }, select: { id: true, companyId: true } });
  expect(admin.companyId).not.toBeNull();
  const companyId = admin.companyId!;
  const positiveName = fx().shortlistName;
  const negativeName = fx().shortlistHoldName;

  const load = async (name: string) => {
    const rows = await prisma.application.findMany({
      where: { jobId: fx().reviewJobId, companyId, candidate: { name } },
      select: { id: true, status: true, humanReviewRequestedAt: true, withdrawnAt: true, updatedAt: true, shortlistedAt: true },
    });
    expect(rows).toHaveLength(1);
    return rows[0]!;
  };
  const positive = await load(positiveName);
  const negative = await load(negativeName);
  for (const row of [positive, negative]) {
    expect(row.status).toBe("CV_POOL");
    expect(row.humanReviewRequestedAt).toBeNull();
    expect(row.withdrawnAt).toBeNull();
  }
  const statusOf = async (id: number) => (await prisma.application.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

  const snapshot = async () => {
    const rows = await prisma.application.findMany({ select: { id: true, status: true, updatedAt: true }, orderBy: { id: "asc" } });
    return new Map(rows.map((row) => [row.id, `${row.status}@${row.updatedAt.toISOString()}`]));
  };
  const before = await snapshot();
  const attemptsBefore = await prisma.outboundEmailAttempt.count();

  await signIn(page, fx().adminEmail);
  const pick = async (name: string) => {
    await page.goto(`/dashboard/jobs/${fx().reviewJobId}/review?view=all`);
    await page.getByRole("textbox", { name: "Search" }).fill(name);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/q=/);
    const box = page.getByRole("checkbox", { name: `Select ${name}` });
    await expect(box).toBeVisible();
    await box.check();
  };
  // The side panel has its own per-applicant buttons; the bulk toolbar buttons come first in the DOM.
  const bulk = (label: "Advance" | "Shortlist") => page.getByRole("button", { name: label, exact: true }).first();

  // Setup through the real workflow: two Advance clicks reach TECH_EVALUATION.
  await pick(positiveName);
  await bulk("Advance").click();
  await expect.poll(() => statusOf(positive.id)).toBe("EXPERT_REVIEW");
  await pick(positiveName);
  await bulk("Advance").click();
  await expect.poll(() => statusOf(positive.id)).toBe("TECH_EVALUATION");
  const ready = await prisma.application.findUniqueOrThrow({ where: { id: positive.id }, select: { shortlistedAt: true } });
  expect(ready.shortlistedAt).toBeNull();

  // Negative: a CV_POOL applicant cannot be shortlisted. shortlistStatus returns null, and
  // applyReviewDecision throws before it writes a decision, an outcome, or an audit row.
  const applicationTrail = (applicationId: number) =>
    Promise.all([
      prisma.auditLog.findMany({
        where: { companyId, targetType: "APPLICATION", targetId: applicationId },
        orderBy: { id: "asc" },
        select: { id: true, action: true, actorUserId: true, actorRole: true, companyId: true, targetId: true },
      }),
      prisma.decisionRecord.findMany({
        where: { companyId, applicationId },
        orderBy: { id: "asc" },
        select: { id: true, rationale: true, decidedByUserId: true },
      }),
      prisma.outcomeEvent.findMany({
        where: { companyId, applicationId },
        orderBy: { id: "asc" },
        select: { id: true, fromStatus: true, toStatus: true, actorUserId: true },
      }),
    ]);
  const negativeTrailBefore = await applicationTrail(negative.id);
  const positiveTrailBefore = await applicationTrail(positive.id);
  expect(negativeTrailBefore).toEqual([[], [], []]);
  expect(positiveTrailBefore[0]).toHaveLength(2);
  const negativeBefore = await prisma.application.findUniqueOrThrow({ where: { id: negative.id }, select: { status: true, updatedAt: true, shortlistedAt: true, candidateStageEmailStatus: true } });
  await pick(negativeName);
  await expect(bulk("Shortlist")).toBeEnabled();
  await bulk("Shortlist").click();
  await expect(page.getByRole("status")).toContainText("0 updated. 1 could not move from their current stage.");
  const negativeAfter = await prisma.application.findUniqueOrThrow({ where: { id: negative.id }, select: { status: true, updatedAt: true, shortlistedAt: true, candidateStageEmailStatus: true } });
  expect(negativeAfter).toEqual(negativeBefore);
  expect(negativeAfter.status).toBe("CV_POOL");
  expect(negativeAfter.shortlistedAt).toBeNull();
  expect(await applicationTrail(negative.id)).toEqual(negativeTrailBefore);
  expect(await applicationTrail(positive.id)).toEqual(positiveTrailBefore);

  // Positive: shortlist the TECH_EVALUATION applicant.
  await pick(positiveName);
  await bulk("Shortlist").click();
  await expect.poll(() => statusOf(positive.id)).toBe("SHORTLISTED");
  await expect(page.getByRole("row").filter({ hasText: positiveName }).getByText(/shortlisted/i)).toBeVisible();

  const final = await prisma.application.findUniqueOrThrow({ where: { id: positive.id }, select: { status: true, companyId: true, shortlistedAt: true, rejectionReason: true } });
  expect(final.companyId).toBe(companyId);
  expect(final.shortlistedAt).not.toBeNull();
  expect(final.rejectionReason).toBeNull();

  const decisions = await prisma.decisionRecord.findMany({ where: { applicationId: positive.id }, orderBy: { id: "asc" } });
  expect(decisions.map((row) => row.rationale)).toEqual([
    "advance: CV_POOL -> EXPERT_REVIEW",
    "advance: EXPERT_REVIEW -> TECH_EVALUATION",
    "shortlist: TECH_EVALUATION -> SHORTLISTED",
  ]);
  for (const row of decisions) expect(row).toMatchObject({ companyId, decidedByUserId: admin.id });
  const audits = await prisma.auditLog.findMany({ where: { targetType: "APPLICATION", targetId: positive.id, action: "APPLICATION_STAGE_CHANGED" } });
  expect(audits).toHaveLength(3);
  for (const row of audits) expect(row).toMatchObject({ actorUserId: admin.id, actorRole: "ADMIN", companyId });
  const outcomes = await prisma.outcomeEvent.findMany({ where: { applicationId: positive.id } });
  expect(outcomes).toHaveLength(1);
  expect(outcomes[0]).toMatchObject({ companyId, actorUserId: admin.id, fromStatus: "TECH_EVALUATION", toStatus: "SHORTLISTED" });

  // Email is sent in the background; with no provider it records why and queues nothing.
  await expect
    .poll(async () => (await prisma.application.findUniqueOrThrow({ where: { id: positive.id }, select: { candidateStageEmailStatus: true } })).candidateStageEmailStatus)
    .toBe("PROVIDER_NOT_CONFIGURED");
  expect(await prisma.outboundEmailAttempt.count()).toBe(attemptsBefore);

  // Only the target moved. The negative applicant and every Kaveri application are unchanged.
  const afterAll = await snapshot();
  expect(afterAll.size).toBe(before.size);
  const changed = [...afterAll].filter(([id, state]) => before.get(id) !== state).map(([id]) => id);
  expect(changed).toEqual([positive.id]);
});

/**
 * STATE-CHANGING only for the batch and its audit rows (disposable database only). Propose through the UI, then
 * "Cancel proposal". cancelCloseOut sets cancelledAt (only while approvedAt and cancelledAt are null) and writes
 * CLOSE_OUT_CANCELLED against the batch; it never touches an application. Approval is a Next server action with no
 * named HTTP route and the UI drops the approval panel after cancelling, so approving the cancelled batch is attempted
 * through the service function approveCloseOut (the same one the action calls). That call is NOT an authenticated
 * browser request; it proves the service refuses a cancelled batch, not the action's own session check.
 */
test("company admin cancels a close-out proposal and the cancelled batch cannot reject anyone", async ({ page }) => {
  assertE2eDatabase();
  const reason = "Location mismatch";
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: fx().adminEmail }, select: { id: true, companyId: true } });
  expect(admin.companyId).not.toBeNull();
  const companyId = admin.companyId!;
  const foreignJob = await prisma.job.findUniqueOrThrow({ where: { id: fx().otherJobId }, select: { companyId: true } });
  expect(foreignJob.companyId).not.toBe(companyId);

  const name = fx().cancelName;
  const matches = await prisma.application.findMany({
    where: { jobId: fx().reviewJobId, companyId, candidate: { name } },
    select: { id: true, status: true, humanReviewRequestedAt: true, withdrawnAt: true, updatedAt: true, candidateStageEmailStatus: true },
  });
  expect(matches).toHaveLength(1);
  const target = matches[0]!;
  expect(target.status).toBe("CV_POOL");
  expect(target.humanReviewRequestedAt).toBeNull();
  expect(target.withdrawnAt).toBeNull();

  const snapshot = async () => {
    const rows = await prisma.application.findMany({ select: { id: true, status: true, updatedAt: true }, orderBy: { id: "asc" } });
    return new Map(rows.map((row) => [row.id, `${row.status}@${row.updatedAt.toISOString()}`]));
  };
  const applicationAudits = (whereCompanyId: number, applicationId?: number) =>
    prisma.auditLog.findMany({
      where: {
        companyId: whereCompanyId,
        targetType: "APPLICATION",
        ...(applicationId === undefined ? {} : { targetId: applicationId }),
      },
      orderBy: { id: "asc" },
      select: { id: true, action: true, actorUserId: true, actorRole: true, companyId: true, targetType: true, targetId: true, reason: true },
    });
  const before = await snapshot();
  const attemptsBefore = await prisma.outboundEmailAttempt.count({ where: { companyId } });
  const targetAuditsBefore = await applicationAudits(companyId, target.id);
  const siblingAuditsBefore = await applicationAudits(companyId);
  const foreignAuditsBefore = await applicationAudits(foreignJob.companyId);
  expect(targetAuditsBefore).toEqual([]);
  const batchesBefore = await prisma.closeOutBatch.count();

  await signIn(page, fx().adminEmail);
  await page.goto(`/dashboard/jobs/${fx().reviewJobId}/review?view=all`);
  await page.getByRole("textbox", { name: "Search" }).fill(name);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/q=/);
  const box = page.getByRole("checkbox", { name: `Select ${name}` });
  await expect(box).toBeVisible();
  await box.check();
  await page.getByRole("button", { name: /^Reject/ }).first().click();
  await page.getByLabel("Rejection reason").selectOption(reason);
  await page.getByRole("button", { name: "Propose close-out for 1 selected" }).click();
  const region = page.getByRole("region", { name: "Approve close-out" });
  await expect(region).toContainText(`reason “${reason}”`);

  const batch = await prisma.closeOutBatch.findFirstOrThrow({
    where: { companyId, jobId: fx().reviewJobId, proposedByUserId: admin.id },
    orderBy: { id: "desc" },
  });
  expect(await prisma.closeOutBatch.count()).toBe(batchesBefore + 1);
  expect(batch).toMatchObject({ companyId, jobId: fx().reviewJobId, reason, proposedByUserId: admin.id, approvedAt: null, cancelledAt: null, approvedByUserId: null });
  expect(batch.applicationIds).toEqual([target.id]);
  expect(await prisma.auditLog.count({ where: { action: "CLOSE_OUT_PROPOSED", targetType: "CLOSE_OUT_BATCH", targetId: batch.id } })).toBe(1);
  expect((await prisma.application.findUniqueOrThrow({ where: { id: target.id }, select: { status: true } })).status).toBe("CV_POOL");

  await region.getByRole("button", { name: "Cancel proposal" }).click();
  await expect(page.getByRole("status")).toContainText("Close-out cancelled. Nothing changed.");
  await expect(page.getByRole("region", { name: "Approve close-out" })).toHaveCount(0);

  const cancelled = await prisma.closeOutBatch.findUniqueOrThrow({ where: { id: batch.id } });
  expect(cancelled.cancelledAt).not.toBeNull();
  expect(cancelled).toMatchObject({ companyId, jobId: fx().reviewJobId, approvedAt: null, approvedByUserId: null, result: null, reason });
  const cancelAudits = await prisma.auditLog.findMany({ where: { action: "CLOSE_OUT_CANCELLED", targetType: "CLOSE_OUT_BATCH", targetId: batch.id } });
  expect(cancelAudits).toHaveLength(1);
  expect(cancelAudits[0]).toMatchObject({ actorUserId: admin.id, actorRole: "ADMIN", companyId });
  expect(await prisma.auditLog.count({ where: { action: "CLOSE_OUT_APPROVED", targetId: batch.id } })).toBe(0);

  const unchanged = async () => {
    const row = await prisma.application.findUniqueOrThrow({ where: { id: target.id }, select: { status: true, updatedAt: true, candidateStageEmailStatus: true, rejectionReason: true } });
    expect(row.status).toBe("CV_POOL");
    expect(row.updatedAt.toISOString()).toBe(target.updatedAt.toISOString());
    expect(row.candidateStageEmailStatus).toBe(target.candidateStageEmailStatus);
    expect(row.rejectionReason).toBeNull();
    expect(await applicationAudits(companyId, target.id)).toEqual([]);
    expect(await prisma.decisionRecord.findMany({ where: { companyId, applicationId: target.id } })).toEqual([]);
    expect(await prisma.outcomeEvent.findMany({ where: { companyId, applicationId: target.id } })).toEqual([]);
    const siblings = await applicationAudits(companyId);
    expect(siblings.filter((audit) => audit.targetId !== target.id)).toEqual(siblingAuditsBefore.filter((audit) => audit.targetId !== target.id));
    expect(await applicationAudits(foreignJob.companyId)).toEqual(foreignAuditsBefore);
    expect(await prisma.outboundEmailAttempt.count({ where: { companyId } })).toBe(attemptsBefore);
  };
  await unchanged();

  // Approving the cancelled batch is refused and writes nothing. A different company cannot see the batch at all.
  const refused = await approveCloseOut({ batchId: batch.id, companyId, actorUserId: admin.id, confirmCount: 1 });
  expect(refused).toEqual({ ok: false, error: "This close-out was already approved or cancelled." });
  const foreignAttempt = await approveCloseOut({ batchId: batch.id, companyId: foreignJob.companyId, actorUserId: admin.id, confirmCount: 1 });
  expect(foreignAttempt).toEqual({ ok: false, error: "Close-out not found." });
  const afterRefusal = await prisma.closeOutBatch.findUniqueOrThrow({ where: { id: batch.id } });
  expect(afterRefusal.approvedAt).toBeNull();
  expect(afterRefusal.approvedByUserId).toBeNull();
  expect(afterRefusal.cancelledAt!.toISOString()).toBe(cancelled.cancelledAt!.toISOString());
  expect(afterRefusal.result).toBeNull();
  expect(await prisma.auditLog.count({ where: { action: "CLOSE_OUT_APPROVED", targetId: batch.id } })).toBe(0);
  await unchanged();

  // Nothing else moved anywhere, in either company.
  const afterAll = await snapshot();
  expect(afterAll.size).toBe(before.size);
  expect([...afterAll].filter(([id, state]) => before.get(id) !== state)).toEqual([]);
});

/**
 * STATE-CHANGING (disposable database only). The authoritative human-review state is Application.humanReviewRequestedAt.
 * It is set by the candidate through the portal ("Request a human review" -> POST /portal/act -> requestPortalHumanReview,
 * which also writes a HUMAN_REVIEW_REQUESTED audit row). The only bulk path that checks it is the close-out:
 * proposeCloseOut leaves such applicants out, and approveCloseOut re-reads the flag per application and skips anyone who
 * asked since the proposal. Advance, shortlist and single reject do NOT check it (applyReviewDecision has no such
 * predicate), so this test does not claim they are blocked.
 *
 * Flow: the admin proposes a close-out of two open applicants in the UI; the test-owned candidate (magic link)
 * then asks for human review in a separate browser context; the admin approves in the still-open UI panel. The target is
 * skipped with "asked for human review", the control is rejected. The proposal-time exclusion is also checked, through
 * proposeCloseOut directly (service call, not an authenticated browser request).
 * updatedAt moves when the candidate asks (it is an ordinary update), so the "unchanged" baseline is taken after that.
 */
test("a candidate who asks for human review is skipped by close-out approval while a control is rejected", async ({ page, browser, baseURL }) => {
  assertE2eDatabase();
  test.skip(!fx().humanReviewUrl, "No portal link was issued");
  const reason = "Location mismatch";
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: fx().adminEmail }, select: { id: true, companyId: true } });
  const companyId = admin.companyId!;
  expect(companyId).not.toBeNull();

  const candidate = await browser.newContext({ baseURL: baseURL ?? undefined });
  const portal = await candidate.newPage();
  await portal.goto(fx().humanReviewUrl!);
  await expect(portal).toHaveURL(/\/portal\/home$/);
  const appLink = portal.getByRole("link", { name: fx().reviewJobTitle });
  const href = await appLink.getAttribute("href");
  const targetId = Number(/\/portal\/applications\/(\d+)$/.exec(href ?? "")?.[1]);
  expect(Number.isInteger(targetId)).toBe(true);

  const target = await prisma.application.findUniqueOrThrow({
    where: { id: targetId },
    select: { id: true, companyId: true, jobId: true, status: true, humanReviewRequestedAt: true, withdrawnAt: true, candidate: { select: { name: true } } },
  });
  expect(target).toMatchObject({ companyId, jobId: fx().reviewJobId, status: "CV_POOL", humanReviewRequestedAt: null, withdrawnAt: null });
  const controlName = fx().humanControlName;
  const control = await prisma.application.findFirstOrThrow({
    where: { jobId: fx().reviewJobId, companyId, candidate: { name: controlName } },
    select: { id: true, status: true, humanReviewRequestedAt: true, withdrawnAt: true },
  });
  expect(control).toMatchObject({ status: "CV_POOL", humanReviewRequestedAt: null, withdrawnAt: null });
  expect(control.id).not.toBe(target.id);

  // Admin proposes a close-out of both. Nobody has asked for human review yet.
  await signIn(page, fx().adminEmail);
  await page.goto(`/dashboard/jobs/${fx().reviewJobId}/review?view=all`);
  await page.getByRole("checkbox", { name: `Select ${target.candidate.name}` }).check();
  await page.getByRole("checkbox", { name: `Select ${controlName}` }).check();
  await page.getByRole("button", { name: /^Reject/ }).first().click();
  await page.getByLabel("Rejection reason").selectOption(reason);
  await page.getByRole("button", { name: "Propose close-out for 2 selected" }).click();
  const region = page.getByRole("region", { name: "Approve close-out" });
  await expect(region).toContainText("0 left out because they asked for human review");
  const batch = await prisma.closeOutBatch.findFirstOrThrow({
    where: { companyId, jobId: fx().reviewJobId, proposedByUserId: admin.id },
    orderBy: { id: "desc" },
  });
  expect(batch).toMatchObject({ companyId, jobId: fx().reviewJobId, reason, proposedByUserId: admin.id, approvedAt: null, cancelledAt: null });
  expect([...(batch.applicationIds as number[])].sort()).toEqual([target.id, control.id].sort());

  // The candidate asks for human review through the real portal control.
  await appLink.click();
  await expect(portal).toHaveURL(new RegExp(`/portal/applications/${target.id}$`));
  await portal.getByRole("button", { name: "Request a human review" }).click();
  await expect(portal.getByRole("button", { name: "Human review requested" })).toBeDisabled();
  await candidate.close();

  const asked = await prisma.application.findUniqueOrThrow({
    where: { id: target.id },
    select: { status: true, updatedAt: true, humanReviewRequestedAt: true, rejectionReason: true, candidateStageEmailStatus: true },
  });
  expect(asked.humanReviewRequestedAt).not.toBeNull();
  expect(asked.status).toBe("CV_POOL");
  const requestAudits = await prisma.auditLog.findMany({ where: { action: "HUMAN_REVIEW_REQUESTED", targetType: "APPLICATION", targetId: target.id } });
  expect(requestAudits).toHaveLength(1);
  expect(requestAudits[0]).toMatchObject({ companyId });

  const snapshot = async () => {
    const rows = await prisma.application.findMany({ select: { id: true, status: true, updatedAt: true }, orderBy: { id: "asc" } });
    return new Map(rows.map((row) => [row.id, `${row.status}@${row.updatedAt.toISOString()}`]));
  };
  const before = await snapshot();
  const counts = async () => ({
    decisions: await prisma.decisionRecord.count(),
    outcomes: await prisma.outcomeEvent.count(),
    attempts: await prisma.outboundEmailAttempt.count(),
  });
  const countsBefore = await counts();
  const targetAuditsBefore = await prisma.auditLog.count({ where: { targetType: "APPLICATION", targetId: target.id } });

  // Proposal-time exclusion: a fresh proposal for the target alone is refused and creates no batch.
  const batchesBefore = await prisma.closeOutBatch.count();
  expect(await proposeCloseOut({ jobId: fx().reviewJobId, companyId, actorUserId: admin.id, reason, applicationIds: [target.id] })).toEqual({
    ok: false,
    error: "No open candidates to close out.",
  });
  expect(await prisma.closeOutBatch.count()).toBe(batchesBefore);

  // The admin approves the still-open panel. The page was loaded before the candidate asked, so only the server can catch it.
  await region.getByLabel("Type 2 to approve").fill("2");
  await region.getByRole("button", { name: "Approve close-out" }).click();
  await expect(page.getByRole("status")).toContainText("1 closed with reason");
  await expect(page.getByRole("status")).toContainText("1 skipped");
  await expect(page.getByRole("status")).toContainText("1 candidate email(s) attempted");

  const approved = await prisma.closeOutBatch.findUniqueOrThrow({ where: { id: batch.id } });
  expect(approved).toMatchObject({ approvedByUserId: admin.id, cancelledAt: null, companyId, jobId: fx().reviewJobId });
  expect(approved.approvedAt).not.toBeNull();
  expect(approved.result).toEqual({ closed: 1, closedIds: [control.id], skipped: [{ id: target.id, reason: "asked for human review" }] });
  const approvals = await prisma.auditLog.findMany({ where: { action: "CLOSE_OUT_APPROVED", targetType: "CLOSE_OUT_BATCH", targetId: batch.id } });
  expect(approvals).toHaveLength(1);
  expect(approvals[0]).toMatchObject({ actorUserId: admin.id, actorRole: "ADMIN", companyId });

  // Protected application: untouched since the candidate asked, and nothing was recorded against it.
  const after = await prisma.application.findUniqueOrThrow({
    where: { id: target.id },
    select: { status: true, updatedAt: true, humanReviewRequestedAt: true, rejectionReason: true, rejectionReasonCode: true, shortlistedAt: true, candidateStageEmailStatus: true },
  });
  expect(after.status).toBe("CV_POOL");
  expect(after.updatedAt.toISOString()).toBe(asked.updatedAt.toISOString());
  expect(after.humanReviewRequestedAt).not.toBeNull();
  expect(after).toMatchObject({ rejectionReason: null, rejectionReasonCode: null, shortlistedAt: null, candidateStageEmailStatus: asked.candidateStageEmailStatus });
  expect(await prisma.decisionRecord.count({ where: { applicationId: target.id } })).toBe(0);
  expect(await prisma.outcomeEvent.count({ where: { applicationId: target.id } })).toBe(0);
  expect(await prisma.auditLog.count({ where: { targetType: "APPLICATION", targetId: target.id } })).toBe(targetAuditsBefore);
  expect(await prisma.auditLog.count({ where: { targetType: "APPLICATION", targetId: target.id, action: { in: ["APPLICATION_REJECTED", "APPLICATION_STAGE_CHANGED"] } } })).toBe(0);

  // Control: the same approval did reject the applicant who had not asked, with the full evidence trail.
  const closed = await prisma.application.findUniqueOrThrow({ where: { id: control.id }, select: { status: true, companyId: true, rejectionReason: true } });
  expect(closed).toMatchObject({ status: "REJECTED", companyId });
  expect(closed.rejectionReason).toContain(reason);
  const decisions = await prisma.decisionRecord.findMany({ where: { applicationId: control.id } });
  expect(decisions).toHaveLength(1);
  expect(decisions[0]).toMatchObject({ companyId, decidedByUserId: admin.id });
  expect(decisions[0]!.rationale).toBe(`reject: CV_POOL -> REJECTED | reason: ${reason} | note: Close-out #${batch.id}`);
  expect(await prisma.outcomeEvent.count({ where: { applicationId: control.id } })).toBe(1);
  expect(await prisma.auditLog.count({ where: { targetType: "APPLICATION", targetId: control.id, action: "APPLICATION_REJECTED" } })).toBe(1);

  // Exactly one decision and one outcome were added, no email attempt was queued, and only the control moved anywhere.
  const countsAfter = await counts();
  expect(countsAfter).toEqual({ decisions: countsBefore.decisions + 1, outcomes: countsBefore.outcomes + 1, attempts: countsBefore.attempts });
  await expect
    .poll(async () => (await prisma.application.findUniqueOrThrow({ where: { id: control.id }, select: { candidateStageEmailStatus: true } })).candidateStageEmailStatus)
    .toBe("PROVIDER_NOT_CONFIGURED");
  const afterAll = await snapshot();
  expect(afterAll.size).toBe(before.size);
  expect([...afterAll].filter(([id, state]) => before.get(id) !== state).map(([id]) => id)).toEqual([control.id]);
});

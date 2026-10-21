import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApplicationPipelineStatus,
  CandidateStatus,
  CodingTestStatus,
  InterviewerCategory,
  InterviewType,
  JobStatus,
  PortalRole,
} from "@prisma/client";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { bookSlotWithToken, issueBookingInvite, listOpenSlotsForBooking } from "@/lib/interviews/scheduling-service";
import { prisma } from "@/lib/prisma";
import { inviteToWalkthrough } from "@/lib/screening/walkthrough-service";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `walk-${process.pid}-${Date.now()}`;
const saved = { app: process.env.APP_URL, resend: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };

type Sent = { to: string; subject: string; text: string };
let sent: Sent[] = [];
let failDelivery = false;

function tokenOf(url: string) {
  return url.split("/schedule/")[1]!;
}

describe.skipIf(integrationDatabase.mode === "skip")("10-minute walkthrough after the practical", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const interviewerIds: number[] = [];
  const emails: string[] = [];

  type Tenant = { companyId: number; adminId: number; jobId: number; specId: number; interviewerId: number | null };
  let a: Tenant;
  let b: Tenant;
  let bare: Tenant;

  async function tenant(label: string, slots: number[], interviewer = true): Promise<Tenant> {
    const company = await prisma.company.create({
      data: { name: `${MARKER} ${label}`, industry: "Test", employees: 5, publicSlug: `${MARKER}-${label}`.toLowerCase() },
    });
    companyIds.push(company.id);
    const admin = await prisma.user.create({
      data: { email: `${MARKER}-${label}@hireiq.test`.toLowerCase(), name: `${label} admin`, role: PortalRole.ADMIN, passwordHash: "not-a-login", emailVerifiedAt: new Date(), companyId: company.id },
    });
    userIds.push(admin.id);
    const person = interviewer ? await prisma.interviewer.create({ data: { name: `${MARKER} ${label} interviewer`, category: InterviewerCategory.ENGINEERING } }) : null;
    if (person) interviewerIds.push(person.id);
    const job = await prisma.job.create({
      data: { title: `${MARKER} ${label} role`, status: JobStatus.OPEN, companyId: company.id, assignedInterviewerId: person?.id ?? null },
    });
    const spec = await prisma.jobSpecificationVersion.create({ data: { jobId: job.id, versionNumber: 1, status: "PUBLISHED", title: job.title } });
    for (const [index, minutes] of slots.entries()) {
      await prisma.interviewSlot.create({
        data: {
          jobId: job.id,
          interviewerId: person!.id,
          interviewType: InterviewType.TECHNICAL,
          startAt: new Date(Date.now() + (index + 1) * 24 * 60 * 60 * 1000 + companyIds.length * 60_000),
          durationMinutes: minutes,
        },
      });
    }
    return { companyId: company.id, adminId: admin.id, jobId: job.id, specId: spec.id, interviewerId: person?.id ?? null };
  }

  async function applicant(row: Tenant, label: string, practical: "submitted" | "assigned" | "none", status: ApplicationPipelineStatus = ApplicationPipelineStatus.CV_POOL) {
    const candidate = await prisma.candidate.create({
      data: { name: `${label}`, role: "Engineer", experienceYears: 3, status: CandidateStatus.APPLIED, companyId: row.companyId },
    });
    const application = await prisma.application.create({ data: { candidateId: candidate.id, jobId: row.jobId, companyId: row.companyId, status } });
    const email = `${MARKER}-${label}@candidate.test`.toLowerCase();
    emails.push(email);
    await prisma.applicationIngestionEvent.create({
      data: {
        companyId: row.companyId,
        jobId: row.jobId,
        applicationId: application.id,
        candidateId: candidate.id,
        sourceChannel: "MANUAL",
        jobSpecificationVersionId: row.specId,
        status: "PROCESSED",
        applicantName: label,
        applicantEmailNormalized: email,
      },
    });
    if (practical !== "none") {
      await prisma.codingTest.create({
        data: {
          applicationId: application.id,
          title: "Data importer",
          score: 0,
          maxScore: 20,
          status: CodingTestStatus.PENDING,
          takenAt: new Date(),
          assignedAt: new Date(),
          submittedAt: practical === "submitted" ? new Date() : null,
          submissionText: practical === "submitted" ? "Streaming parser with retries." : null,
        },
      });
    }
    return application.id;
  }

  function invite(row: Tenant, applicationId: number, resend = false) {
    return inviteToWalkthrough({ jobId: row.jobId, applicationId, companyId: row.companyId, actorUserId: row.adminId, resend });
  }

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:4000";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.EMAIL_FROM = "HireIQ <test@hireiq.test>";
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      if (!String(url).startsWith("https://api.resend.com/")) throw new Error(`Unexpected network call to ${String(url)}`);
      const body = JSON.parse(String(init?.body ?? "{}")) as { to: string[]; subject: string; text: string };
      if (failDelivery) return new Response("provider down", { status: 503 });
      sent.push({ to: body.to[0]!, subject: body.subject, text: body.text });
      return new Response(JSON.stringify({ id: "test" }), { status: 200 });
    });
    a = await tenant("a", [10, 10, 45]);
    b = await tenant("b", [10]);
    bare = await tenant("bare", [45]);
  });

  beforeEach(() => {
    sent = [];
    failDelivery = false;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    process.env.APP_URL = saved.app;
    process.env.RESEND_API_KEY = saved.resend;
    process.env.EMAIL_FROM = saved.from;
    const where = { companyId: { in: companyIds } };
    const applications = await prisma.application.findMany({ where, select: { id: true } });
    const applicationIds = applications.map((row) => row.id);
    const interviews = await prisma.interview.findMany({ where: { applicationId: { in: applicationIds } }, select: { id: true } });
    await prisma.interviewReminder.deleteMany({ where: { interviewId: { in: interviews.map((row) => row.id) } } });
    await prisma.interview.deleteMany({ where: { applicationId: { in: applicationIds } } });
    await prisma.notification.deleteMany({ where });
    await prisma.interviewSlot.deleteMany({ where: { job: where } });
    await prisma.interviewBookingInvite.deleteMany({ where: { applicationId: { in: applicationIds } } });
    await prisma.outboundEmailAttempt.deleteMany({ where: { to: { in: emails } } });
    await prisma.codingTest.deleteMany({ where: { applicationId: { in: applicationIds } } });
    await prisma.applicationIngestionEvent.deleteMany({ where });
    for (const companyId of companyIds) await deleteAuditLogsForTests({ companyId });
    await prisma.application.deleteMany({ where });
    await prisma.candidate.deleteMany({ where });
    await prisma.jobSpecificationVersion.deleteMany({ where: { job: where } });
    await prisma.job.deleteMany({ where });
    await prisma.interviewer.deleteMany({ where: { id: { in: interviewerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  it("invites an eligible candidate, who books a 10-minute slot through the existing booking flow", async () => {
    const applicationId = await applicant(a, "eligible", "submitted");
    const result = await invite(a, applicationId);
    expect(result).toMatchObject({ ok: true, openSlots: 2, resent: false, emailOutcome: "sent" });
    if (!result.ok) throw new Error(result.error);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(`${MARKER}-eligible@candidate.test`.toLowerCase());
    expect(sent[0]!.text).toContain(result.url);
    expect(await prisma.auditLog.count({ where: { companyId: a.companyId, action: "WALKTHROUGH_INVITED", targetId: applicationId } })).toBe(1);

    const listing = await listOpenSlotsForBooking(tokenOf(result.url));
    const short = listing!.slots.find((slot) => slot.durationMinutes === 10)!;
    const booked = await bookSlotWithToken({ rawToken: tokenOf(result.url), slotId: short.id });
    expect(booked.ok).toBe(true);
    const slot = await prisma.interviewSlot.findUniqueOrThrow({ where: { id: short.id } });
    expect(slot).toMatchObject({ status: "BOOKED", bookedApplicationId: applicationId });

    const again = await invite(a, applicationId);
    expect(again).toMatchObject({ ok: false, code: "ALREADY_BOOKED" });
  });

  it("refuses candidates who have not submitted the practical or whose application is closed", async () => {
    const assigned = await applicant(a, "assigned-only", "assigned");
    const none = await applicant(a, "no-practical", "none");
    const closed = await applicant(a, "closed", "submitted", ApplicationPipelineStatus.REJECTED);
    expect(await invite(a, assigned)).toMatchObject({ ok: false, code: "NO_PRACTICAL_SUBMISSION" });
    expect(await invite(a, none)).toMatchObject({ ok: false, code: "NO_PRACTICAL_SUBMISSION" });
    expect(await invite(a, closed)).toMatchObject({ ok: false, code: "CLOSED" });
    expect(await prisma.interviewBookingInvite.count({ where: { applicationId: { in: [assigned, none, closed] } } })).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("refuses when only long slots are open or no interviewer is assigned, without minting a link", async () => {
    const longOnly = await applicant(bare, "long-only", "submitted");
    expect(await invite(bare, longOnly)).toMatchObject({ ok: false, code: "NO_SLOTS" });
    const noInterviewer = await tenant("nobody", [], false);
    const orphan = await applicant(noInterviewer, "orphan", "submitted");
    expect(await invite(noInterviewer, orphan)).toMatchObject({ ok: false, code: "NO_INTERVIEWER" });
    expect(await prisma.interviewBookingInvite.count({ where: { applicationId: { in: [longOnly, orphan] } } })).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("reports a delivery failure, refuses a silent duplicate, and replaces the link on an explicit resend", async () => {
    const applicationId = await applicant(a, "flaky", "submitted");
    const email = `${MARKER}-flaky@candidate.test`.toLowerCase();
    failDelivery = true;
    const first = await invite(a, applicationId);
    expect(first).toMatchObject({ ok: true, emailOutcome: "provider-error" });
    if (!first.ok) throw new Error(first.error);
    const queued = await prisma.outboundEmailAttempt.findFirstOrThrow({ where: { to: email } });
    expect(queued.status).toBe("FAILED");
    expect(queued.nextRetryAt.getFullYear()).toBeLessThan(2099);

    failDelivery = false;
    expect(await invite(a, applicationId)).toMatchObject({ ok: false, code: "ALREADY_INVITED" });
    expect(sent).toHaveLength(0);

    const retried = await invite(a, applicationId, true);
    expect(retried).toMatchObject({ ok: true, resent: true, emailOutcome: "sent" });
    if (!retried.ok) throw new Error(retried.error);
    expect(sent).toHaveLength(1);
    expect(retried.url).not.toBe(first.url);
    expect(await listOpenSlotsForBooking(tokenOf(first.url))).toBeNull();
    expect(await listOpenSlotsForBooking(tokenOf(retried.url))).not.toBeNull();
    const superseded = await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: queued.id } });
    expect(superseded.nextRetryAt.getFullYear()).toBe(2099);
    expect(superseded.lastError).toBe("Replaced by a newer walkthrough link.");
    expect(await prisma.auditLog.count({ where: { companyId: a.companyId, targetId: applicationId, action: "WALKTHROUGH_RESENT" } })).toBe(1);
  });

  it("sends one invite when two recruiters click at the same time", async () => {
    const applicationId = await applicant(a, "double-click", "submitted");
    const results = await Promise.all([invite(a, applicationId), invite(a, applicationId)]);
    expect(results.filter((row) => row.ok)).toHaveLength(1);
    expect(results.filter((row) => !row.ok && row.code === "ALREADY_INVITED")).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("does not let another company invite, look up, or book this company's candidate", async () => {
    const applicationId = await applicant(a, "isolated", "submitted");
    expect(await inviteToWalkthrough({ jobId: a.jobId, applicationId, companyId: b.companyId, actorUserId: b.adminId })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await inviteToWalkthrough({ jobId: b.jobId, applicationId, companyId: b.companyId, actorUserId: b.adminId })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await prisma.interviewBookingInvite.count({ where: { applicationId } })).toBe(0);

    const ok = await invite(a, applicationId);
    if (!ok.ok) throw new Error(ok.error);
    const otherCompanySlot = await prisma.interviewSlot.findFirstOrThrow({ where: { jobId: b.jobId } });
    expect(await bookSlotWithToken({ rawToken: tokenOf(ok.url), slotId: otherCompanySlot.id })).toEqual({ ok: false, errorCode: "SLOT_UNAVAILABLE" });
    const listing = await listOpenSlotsForBooking(tokenOf(ok.url));
    expect(listing!.slots.every((slot) => slot.id !== otherCompanySlot.id)).toBe(true);
  });

  describe("server-side booking rules", () => {
    async function liveToken(row: Tenant, label: string) {
      const applicationId = await applicant(row, label, "submitted");
      const result = await invite(row, applicationId);
      if (!result.ok) throw new Error(result.error);
      return { applicationId, rawToken: tokenOf(result.url) };
    }
    async function slotAt(row: Tenant, daysAhead: number, minuteOffset: number, minutes: number, jobId = row.jobId) {
      return prisma.interviewSlot.create({
        data: {
          jobId,
          interviewerId: row.interviewerId!,
          interviewType: InterviewType.TECHNICAL,
          startAt: new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000 + minuteOffset * 60_000),
          durationMinutes: minutes,
        },
      });
    }

    it("refuses a longer slot even when the id is sent directly, and leaves it open", async () => {
      const { rawToken } = await liveToken(a, "long-direct");
      const long = await slotAt(a, 20, 0, 45);
      const listing = await listOpenSlotsForBooking(rawToken);
      expect(listing!.slots.every((slot) => slot.durationMinutes === 10)).toBe(true);
      expect(listing!.slots.some((slot) => slot.id === long.id)).toBe(false);
      expect(await bookSlotWithToken({ rawToken, slotId: long.id })).toEqual({ ok: false, errorCode: "SLOT_DURATION_MISMATCH" });
      expect((await prisma.interviewSlot.findUniqueOrThrow({ where: { id: long.id } })).status).toBe("OPEN");
      const longer = await slotAt(a, 21, 0, 11);
      expect(await bookSlotWithToken({ rawToken, slotId: longer.id })).toEqual({ ok: false, errorCode: "SLOT_DURATION_MISMATCH" });
    });

    it("refuses a slot that overlaps another booking for the same interviewer", async () => {
      const first = await liveToken(a, "overlap-1");
      const second = await liveToken(a, "overlap-2");
      const early = await slotAt(a, 22, 0, 10);
      const overlapping = await slotAt(a, 22, 5, 10);
      const adjacent = await slotAt(a, 22, 10, 10);
      expect((await bookSlotWithToken({ rawToken: first.rawToken, slotId: early.id })).ok).toBe(true);
      expect(await bookSlotWithToken({ rawToken: second.rawToken, slotId: overlapping.id })).toEqual({ ok: false, errorCode: "SLOT_UNAVAILABLE" });
      expect((await prisma.interviewSlot.findUniqueOrThrow({ where: { id: overlapping.id } })).status).toBe("OPEN");
      expect((await bookSlotWithToken({ rawToken: second.rawToken, slotId: adjacent.id })).ok).toBe(true);
    });

    it("books only one of two overlapping slots when two candidates race", async () => {
      const first = await liveToken(a, "race-1");
      const second = await liveToken(a, "race-2");
      const left = await slotAt(a, 23, 0, 10);
      const right = await slotAt(a, 23, 5, 10);
      const results = await Promise.all([
        bookSlotWithToken({ rawToken: first.rawToken, slotId: left.id }),
        bookSlotWithToken({ rawToken: second.rawToken, slotId: right.id }),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(await prisma.interviewSlot.count({ where: { id: { in: [left.id, right.id] }, status: "BOOKED" } })).toBe(1);
    });

    it("refuses to book while the assigned interviewer is unavailable", async () => {
      const { rawToken } = await liveToken(a, "unavailable");
      const slot = await slotAt(a, 24, 0, 10);
      await prisma.interviewer.update({ where: { id: a.interviewerId! }, data: { availability: "NOT_AVAILABLE" } });
      try {
        expect(await bookSlotWithToken({ rawToken, slotId: slot.id })).toEqual({ ok: false, errorCode: "SLOT_UNAVAILABLE" });
      } finally {
        await prisma.interviewer.update({ where: { id: a.interviewerId! }, data: { availability: "AVAILABLE" } });
      }
      expect((await prisma.interviewSlot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe("OPEN");
    });

    it("refuses a slot that belongs to another job, even in the same company, and another company's slot", async () => {
      const { rawToken } = await liveToken(a, "association");
      const otherJob = await prisma.job.create({
        data: { title: `${MARKER} other role`, status: JobStatus.OPEN, companyId: a.companyId, assignedInterviewerId: a.interviewerId },
      });
      const elsewhere = await slotAt(a, 25, 0, 10, otherJob.id);
      expect(await bookSlotWithToken({ rawToken, slotId: elsewhere.id })).toEqual({ ok: false, errorCode: "SLOT_UNAVAILABLE" });
      const foreign = await prisma.interviewSlot.findFirstOrThrow({ where: { jobId: b.jobId } });
      expect(await bookSlotWithToken({ rawToken, slotId: foreign.id })).toEqual({ ok: false, errorCode: "SLOT_UNAVAILABLE" });
      expect(await bookSlotWithToken({ rawToken: "not-a-real-token", slotId: foreign.id })).toEqual({ ok: false, errorCode: "BOOKING_LINK_INVALID" });
      expect(await prisma.interviewSlot.count({ where: { id: { in: [elsewhere.id, foreign.id] }, status: "BOOKED" } })).toBe(0);
    });

    it("keeps the general booking link unchanged: it can still book a longer interview", async () => {
      const applicationId = await applicant(a, "general-link", "none");
      const minted = await issueBookingInvite(prisma, applicationId);
      const long = await slotAt(a, 26, 0, 45);
      const booked = await bookSlotWithToken({ rawToken: tokenOf(minted.bookingUrl!), slotId: long.id });
      expect(booked.ok).toBe(true);
    });

    it("a new walkthrough link replaces a general one and restores the 10-minute rule", async () => {
      const applicationId = await applicant(a, "upgrade-link", "submitted");
      await issueBookingInvite(prisma, applicationId);
      const result = await invite(a, applicationId, true);
      if (!result.ok) throw new Error(result.error);
      const row = await prisma.interviewBookingInvite.findUniqueOrThrow({ where: { applicationId } });
      expect(row.requiredDurationMinutes).toBe(10);
    });
  });
});

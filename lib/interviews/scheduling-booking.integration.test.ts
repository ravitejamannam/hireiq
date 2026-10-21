import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  ApplicationPipelineStatus,
  CandidateStatus,
  InterviewerCategory,
  JobStatus,
  PortalRole,
} from "@prisma/client";
import { generateSecureToken } from "@/lib/auth/secure-token";
import { AuthorizationError } from "@/lib/auth/authorization";
import {
  bookSlotWithToken,
  createSlotsForJobForAdmin,
  SchedulingError,
} from "@/lib/interviews/scheduling-service";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const actor = vi.hoisted(() => ({ id: "0" }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));






const MARKER = `slot-${process.pid}-${Date.now()}`;

function asUser(id: number) {
  actor.id = String(id);
}

describe.skipIf(integrationDatabase.mode === "skip")("interview slot booking", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const interviewerIds: number[] = [];
  const jobIds: number[] = [];
  const candidateIds: number[] = [];
  const applicationIds: number[] = [];
  const slotIds: number[] = [];
  const inviteIds: number[] = [];
  const interviewIds: number[] = [];

  afterAll(async () => {
    const companies = companyIds.filter((id) => id > 0);
    const users = userIds.filter((id) => id > 0);
    const interviewers = interviewerIds.filter((id) => id > 0);
    const jobs = jobIds.filter((id) => id > 0);
    const candidates = candidateIds.filter((id) => id > 0);
    const applications = applicationIds.filter((id) => id > 0);
    const slots = slotIds.filter((id) => id > 0);
    const invites = inviteIds.filter((id) => id > 0);
    const interviews = interviewIds.filter((id) => id > 0);
    if (
      companies.length +
        users.length +
        interviewers.length +
        jobs.length +
        candidates.length +
        applications.length +
        slots.length +
        invites.length +
        interviews.length ===
      0
    ) {
      return;
    }

    const failures: string[] = [];
    const attempt = async (step: string, run: () => Promise<unknown>) => {
      try {
        await run();
        return true;
      } catch (error) {
        failures.push(`${step}: ${error instanceof Error ? error.message : "cleanup failed"}`);
        return false;
      }
    };

    // InterviewReminder cascades from Interview, so a reminder failure does not
    // block the interview delete. Notification, Interview, InterviewBookingInvite,
    // and InterviewSlot do not reference one another. Interview and the invite
    // both restrict Application. Slot and Notification restrict Job and
    // Interviewer. Notification also restricts Company. Candidate and Job wait
    // on Application, then are independent. The client user restricts Company.
    // Interviewer does not block Company once its parents are gone.
    const interviewWhere =
      interviews.length > 0 && applications.length > 0
        ? { OR: [{ id: { in: interviews } }, { applicationId: { in: applications } }] }
        : interviews.length > 0
          ? { id: { in: interviews } }
          : { applicationId: { in: applications } };
    const reminderWhere =
      interviews.length > 0 && applications.length > 0
        ? {
            OR: [
              { interviewId: { in: interviews } },
              { interview: { applicationId: { in: applications } } },
            ],
          }
        : interviews.length > 0
          ? { interviewId: { in: interviews } }
          : { interview: { applicationId: { in: applications } } };
    const slotWhere =
      slots.length > 0 && jobs.length > 0
        ? { OR: [{ id: { in: slots } }, { jobId: { in: jobs } }] }
        : slots.length > 0
          ? { id: { in: slots } }
          : { jobId: { in: jobs } };

    let interviewsGone = interviews.length === 0 && applications.length === 0;
    if (interviews.length > 0 || applications.length > 0) {
      await attempt("interview reminders", () =>
        prisma.interviewReminder.deleteMany({ where: reminderWhere }));
      interviewsGone = await attempt("interviews", () =>
        prisma.interview.deleteMany({ where: interviewWhere }));
    }
    let notificationsGone = jobs.length === 0;
    if (jobs.length > 0) {
      notificationsGone = await attempt("notifications", () =>
        prisma.notification.deleteMany({ where: { jobId: { in: jobs } } }));
    }
    let invitesGone = invites.length === 0;
    if (invites.length > 0) {
      invitesGone = await attempt("booking invites", () =>
        prisma.interviewBookingInvite.deleteMany({ where: { id: { in: invites } } }));
    }
    let slotsGone = slots.length === 0 && jobs.length === 0;
    if (slots.length > 0 || jobs.length > 0) {
      slotsGone = await attempt("slots", () =>
        prisma.interviewSlot.deleteMany({ where: slotWhere }));
    }
    let applicationsGone = applications.length === 0;
    if (interviewsGone && invitesGone && applications.length > 0) {
      applicationsGone = await attempt("applications", () =>
        prisma.application.deleteMany({ where: { id: { in: applications } } }));
    }
    let candidatesGone = candidates.length === 0;
    if (applicationsGone && candidates.length > 0) {
      candidatesGone = await attempt("candidates", () =>
        prisma.candidate.deleteMany({ where: { id: { in: candidates } } }));
    }
    let jobsGone = jobs.length === 0;
    if (applicationsGone && notificationsGone && slotsGone && jobs.length > 0) {
      jobsGone = await attempt("jobs", () =>
        prisma.job.deleteMany({ where: { id: { in: jobs } } }));
    }
    let usersGone = users.length === 0;
    if (users.length > 0) {
      usersGone = await attempt("users", () =>
        prisma.user.deleteMany({ where: { id: { in: users } } }));
    }
    if (notificationsGone && slotsGone && jobsGone && interviewers.length > 0) {
      await attempt("interviewers", () =>
        prisma.interviewer.deleteMany({ where: { id: { in: interviewers } } }));
    }
    if (
      applicationsGone &&
      candidatesGone &&
      jobsGone &&
      notificationsGone &&
      usersGone &&
      companies.length > 0
    ) {
      await attempt("companies", () =>
        prisma.company.deleteMany({ where: { id: { in: companies } } }));
    }
    if (failures.length > 0) {
      throw new Error(`Interview slot booking fixture cleanup failed.\n${failures.join("\n")}`);
    }
  });

  it("claims one slot once and rejects the other interviewer and a second booking", async () => {
    const company = await prisma.company.create({
      data: {
        name: `${MARKER} co`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    companyIds.push(company.id);
    const profile = await prisma.interviewer.create({
      data: { name: `${MARKER} iv`, category: InterviewerCategory.ENGINEERING },
    });
    interviewerIds.push(profile.id);
    const other = await prisma.interviewer.create({
      data: { name: `${MARKER} other`, category: InterviewerCategory.ENGINEERING },
    });
    interviewerIds.push(other.id);
    const admin = await prisma.user.create({
      data: {
        email: `${MARKER}-admin@hireiq.test`.toLowerCase(),
        name: "admin",
        role: PortalRole.ADMIN,
        passwordHash: "not-a-login",
      },
    });
    userIds.push(admin.id);
    const client = await prisma.user.create({
      data: {
        email: `${MARKER}-client@hireiq.test`.toLowerCase(),
        name: "client",
        role: PortalRole.CLIENT,
        passwordHash: "not-a-login",
        emailVerifiedAt: new Date(),
        companyId: company.id,
      },
    });
    userIds.push(client.id);
    const job = await prisma.job.create({
      data: {
        title: `${MARKER} role`,
        status: JobStatus.OPEN,
        companyId: company.id,
        assignedInterviewerId: profile.id,
      },
    });
    jobIds.push(job.id);
    const candidate = await prisma.candidate.create({
      data: {
        name: `${MARKER} candidate`,
        role: "Engineer",
        experienceYears: 2,
        status: CandidateStatus.APPLIED,
        companyId: company.id,
      },
    });
    candidateIds.push(candidate.id);
    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        companyId: company.id,
        status: ApplicationPipelineStatus.TECH_EVALUATION,
      },
    });
    applicationIds.push(application.id);

    const startAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    asUser(client.id);
    await expect(
      createSlotsForJobForAdmin({
        jobId: job.id,
        interviewerId: profile.id,
        interviewType: "TECHNICAL",
        slots: [{ startAt }],
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    asUser(admin.id);
    await expect(
      createSlotsForJobForAdmin({
        jobId: job.id,
        interviewerId: other.id,
        interviewType: "TECHNICAL",
        slots: [{ startAt }],
      }),
    ).rejects.toBeInstanceOf(SchedulingError);
    expect(await prisma.interviewSlot.count({ where: { jobId: job.id } })).toBe(0);

    const created = await createSlotsForJobForAdmin({
      jobId: job.id,
      interviewerId: profile.id,
      interviewType: "TECHNICAL",
      slots: [{ startAt, durationMinutes: 45 }],
    });
    expect(created.created).toBe(1);
    const slot = await prisma.interviewSlot.findFirstOrThrow({ where: { jobId: job.id } });
    slotIds.push(slot.id);
    const { rawToken, tokenHash } = generateSecureToken();
    const invite = await prisma.interviewBookingInvite.create({
      data: {
        applicationId: application.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    inviteIds.push(invite.id);

    const raced = await Promise.all([
      bookSlotWithToken({ rawToken, slotId: slot.id }),
      bookSlotWithToken({ rawToken, slotId: slot.id }),
    ]);
    for (const result of raced) {
      if (result.ok) interviewIds.push(result.interviewId);
    }
    const wins = raced.filter((result) => result.ok);
    const losses = raced.filter((result) => !result.ok);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    if (!losses[0].ok) {
      expect(["SLOT_UNAVAILABLE", "BOOKING_LINK_INVALID"]).toContain(losses[0].errorCode);
    }
    expect(await prisma.interview.count({ where: { applicationId: application.id } })).toBe(1);
    expect(
      (await prisma.interviewSlot.findUnique({ where: { id: slot.id }, select: { status: true } }))
        ?.status,
    ).toBe("BOOKED");

    const retry = await bookSlotWithToken({ rawToken, slotId: slot.id });
    expect(retry.ok).toBe(false);
    if (!retry.ok) expect(retry.errorCode).toBe("BOOKING_LINK_INVALID");
    expect(await prisma.interview.count({ where: { applicationId: application.id } })).toBe(1);
  });
});

import "@/lib/evidence-graph/evidence-graph-test-env";

import { afterAll, describe, expect, it, vi } from "vitest";
import {
  ApplicationPipelineStatus,
  CandidateStatus,
  InterviewerCategory,
  JobStatus,
  PortalRole,
} from "@prisma/client";

const actor = vi.hoisted(() => ({ id: "0" }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));

import { generateSecureToken } from "@/lib/auth/secure-token";
import { AuthorizationError } from "@/lib/auth/authorization";
import {
  bookSlotWithToken,
  createSlotsForJobForAdmin,
  SchedulingError,
} from "@/lib/interviews/scheduling-service";
import { prisma } from "@/lib/prisma";

const MARKER = `slot-${process.pid}-${Date.now()}`;

function asUser(id: number) {
  actor.id = String(id);
}

describe("interview slot booking", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const interviewerIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.notification.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.interview.deleteMany({
      where: { application: { companyId: { in: companyIds } } },
    });
    await prisma.interviewBookingInvite.deleteMany({
      where: { application: { companyId: { in: companyIds } } },
    });
    await prisma.interviewSlot.deleteMany({
      where: { job: { companyId: { in: companyIds } } },
    });
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.interviewer.deleteMany({ where: { id: { in: interviewerIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
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
    const other = await prisma.interviewer.create({
      data: { name: `${MARKER} other`, category: InterviewerCategory.ENGINEERING },
    });
    interviewerIds.push(profile.id, other.id);
    const admin = await prisma.user.create({
      data: {
        email: `${MARKER}-admin@hireiq.test`.toLowerCase(),
        name: "admin",
        role: PortalRole.ADMIN,
        passwordHash: "not-a-login",
      },
    });
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
    userIds.push(admin.id, client.id);
    const job = await prisma.job.create({
      data: {
        title: `${MARKER} role`,
        status: JobStatus.OPEN,
        companyId: company.id,
        assignedInterviewerId: profile.id,
      },
    });
    const candidate = await prisma.candidate.create({
      data: {
        name: `${MARKER} candidate`,
        role: "Engineer",
        experienceYears: 2,
        status: CandidateStatus.APPLIED,
        companyId: company.id,
      },
    });
    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        companyId: company.id,
        status: ApplicationPipelineStatus.TECH_EVALUATION,
      },
    });

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
    const { rawToken, tokenHash } = generateSecureToken();
    await prisma.interviewBookingInvite.create({
      data: {
        applicationId: application.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const raced = await Promise.all([
      bookSlotWithToken({ rawToken, slotId: slot.id }),
      bookSlotWithToken({ rawToken, slotId: slot.id }),
    ]);
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

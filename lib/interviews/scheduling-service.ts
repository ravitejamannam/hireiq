import {
  InterviewResult,
  InterviewSlotStatus,
  InterviewType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/authorization";
import { generateSecureToken, hashSecureToken } from "@/lib/auth/secure-token";
import { getPublicAppUrl } from "@/lib/communication/email-config";

/**
 * Self-serve interview scheduling (T100 Phase 9).
 *
 * Flow: admin/interviewer publishes OPEN slots for a job → a booking
 * invite token is minted per application → the candidate books a slot on
 * a public page → the Interview row is created and the slot claimed in
 * one transaction.
 *
 * Guarantees:
 * - No double-booking: the slot is claimed via updateMany guarded on
 *   status=OPEN inside the booking transaction; two concurrent bookings
 *   of the same slot cannot both succeed (count check).
 * - Tokens: 256-bit, hash-only persistence, expiring, single-use (§13).
 * - Tenant safety: slots resolve to the application's own job; invites
 *   are 1:1 with applications.
 */

export class SchedulingError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

const BOOKING_INVITE_TTL_HOURS = 72;

// ---------- admin: publish slots ----------

export type SlotInput = { startAt: unknown; durationMinutes?: unknown };

export async function createSlotsForJobForAdmin(input: {
  jobId: unknown;
  interviewerId: unknown;
  interviewType: unknown;
  slots: unknown;
}): Promise<{ created: number }> {
  await requireAdmin();

  const jobId = requireInt(input.jobId, "INVALID_JOB_ID");
  const interviewerId = requireInt(input.interviewerId, "INVALID_INTERVIEWER_ID");
  const interviewType = normalizeInterviewType(input.interviewType);

  const job = await prisma.job.findFirst({
    where: { id: jobId },
    select: { id: true, assignedInterviewerId: true },
  });
  if (!job) throw new SchedulingError("JOB_NOT_FOUND");

  // The assigned interviewer owns interviews for this job; publishing
  // slots for anyone else would create orphaned interviews.
  if (job.assignedInterviewerId !== interviewerId) {
    throw new SchedulingError(
      "INTERVIEWER_NOT_ASSIGNED",
      "Slots can only be published for the assigned interviewer.",
    );
  }

  const rows = validateSlots(input.slots);
  if (rows.length === 0) throw new SchedulingError("SLOTS_REQUIRED");

  const created = await prisma.interviewSlot.createMany({
    data: rows.map((row) => ({
      jobId,
      interviewerId,
      interviewType,
      startAt: row.startAt,
      durationMinutes: row.durationMinutes,
    })),
    skipDuplicates: true, // unique(interviewerId, startAt)
  });

  return { created: created.count };
}

function validateSlots(slotsInput: unknown): Array<{
  startAt: Date;
  durationMinutes: number;
}> {
  if (!Array.isArray(slotsInput) || slotsInput.length === 0) {
    return [];
  }
  if (slotsInput.length > 200) throw new SchedulingError("TOO_MANY_SLOTS");

  const seen = new Set<string>();
  const out: Array<{ startAt: Date; durationMinutes: number }> = [];

  for (const raw of slotsInput) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    const startAt = parseDate(s.startAt);
    if (!startAt || startAt.getTime() < Date.now()) {
      throw new SchedulingError("SLOT_START_INVALID", "Slots must be in the future.");
    }
    const durationMinutes =
      s.durationMinutes === undefined ? 45 : Number(s.durationMinutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240) {
      throw new SchedulingError("DURATION_INVALID", "Duration must be 15-240 minutes.");
    }
    const key = String(startAt.toISOString());
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ startAt, durationMinutes });
  }
  return out;
}

// ---------- invite minting ----------

export async function mintBookingInviteForApplication(input: {
  actorIsAdminVerified: true;
  applicationId: unknown;
}): Promise<{ bookingUrl: string | null; expiresAt: Date }> {
  await requireAdmin();

  const applicationId = requireInt(input.applicationId, "INVALID_APPLICATION_ID");
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, job: { select: { assignedInterviewerId: true } } },
  });
  if (!application) throw new SchedulingError("APPLICATION_NOT_FOUND");
  if (!application.job.assignedInterviewerId) {
    throw new SchedulingError("NO_ASSIGNED_INTERVIEWER");
  }

  const origin = getPublicAppUrl();
  const { rawToken, tokenHash } = generateSecureToken();
  const expiresAt = new Date(Date.now() + BOOKING_INVITE_TTL_HOURS * 60 * 60 * 1000);

  await prisma.interviewBookingInvite.upsert({
    where: { applicationId },
    create: { applicationId, tokenHash, expiresAt },
    update: { tokenHash, expiresAt, usedAt: null },
  });

  return {
    bookingUrl: origin ? `${origin}/schedule/${rawToken}` : null,
    expiresAt,
  };
}

// ---------- public booking ----------

export async function listOpenSlotsForBooking(rawToken: string): Promise<{
  jobTitle: string;
  companyName: string;
  interviewerName: string;
  interviewerId: number | null;
  slots: Array<{ id: number; startAt: Date; durationMinutes: number }>;
} | null> {
  const invite = await loadLiveInvite(rawToken);
  if (!invite) return null;

  const application = await prisma.application.findUnique({
    where: { id: invite.applicationId },
    select: {
      job: {
        select: {
          id: true,
          companyId: true,
          title: true,
          company: { select: { name: true } },
          assignedInterviewer: { select: { id: true, name: true } },
          interviewSlots: {
            where: { status: InterviewSlotStatus.OPEN, startAt: { gt: new Date() } },
            select: { id: true, startAt: true, durationMinutes: true },
            orderBy: { startAt: "asc" },
            take: 50,
          },
        },
      },
    },
  });
  if (!application) return null;

  return {
    jobTitle: application.job.title,
    companyName: application.job.company.name,
    interviewerName: application.job.assignedInterviewer?.name ?? "Interviewer",
    interviewerId: application.job.assignedInterviewer?.id ?? null,
    slots: application.job.interviewSlots,
  };
}

export async function bookSlotWithToken(input: {
  rawToken: string;
  slotId: unknown;
  candidateContact?: { name?: string; email?: string };
}): Promise<
  | { ok: true; interviewId: number; scheduledAt: Date }
  | { ok: false; errorCode: string }
> {
  const slotId = requireInt(input.slotId, "INVALID_SLOT_ID");

  const invite = await loadLiveInvite(input.rawToken);
  if (!invite) return { ok: false, errorCode: "BOOKING_LINK_INVALID" };

  const application = await prisma.application.findUnique({
    where: { id: invite.applicationId },
    select: {
      id: true,
      job: {
        select: {
          id: true,
          companyId: true,
          title: true,
          company: { select: { name: true } },
          assignedInterviewerId: true,
          assignedInterviewer: {
            select: { name: true, users: { select: { email: true }, take: 1 } },
          },
          interviewSlots: {
            where: { id: slotId },
            select: {
              id: true,
              status: true,
              startAt: true,
              durationMinutes: true,
              interviewType: true,
              interviewerId: true,
            },
          },
        },
      },
    },
  });
  if (!application) return { ok: false, errorCode: "BOOKING_LINK_INVALID" };

  const slot = application.job.interviewSlots[0];
  if (
    !slot ||
    slot.status !== InterviewSlotStatus.OPEN ||
    slot.startAt.getTime() < Date.now() ||
    slot.interviewerId !== application.job.assignedInterviewerId
  ) {
    return { ok: false, errorCode: "SLOT_UNAVAILABLE" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Guarded claim: only succeeds if the slot is still OPEN. Two
      // concurrent bookings of the same slot cannot both pass this.
      const claimed = await tx.interviewSlot.updateMany({
        where: { id: slot.id, status: InterviewSlotStatus.OPEN },
        data: { status: InterviewSlotStatus.BOOKED, bookedApplicationId: application.id },
      });
      if (claimed.count !== 1) {
        throw new SchedulingError("SLOT_UNAVAILABLE");
      }

      const interview = await tx.interview.create({
        data: {
          applicationId: application.id,
          type: slot.interviewType,
          interviewAt: slot.startAt,
          result: InterviewResult.PENDING,
        },
        select: { id: true },
      });

      await tx.interviewBookingInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });

      return interview;
    });

    // T110: notify the assigned interviewer in-app that a slot was booked.
    // Best-effort after commit — a notification failure must not roll back
    // a completed booking.
    try {
      await prisma.notification.create({
        data: {
          type: "INTERVIEWER_INTERVIEW_BOOKED",
          message: `Interview booked for ${application.job.title} on ${slot.startAt.toISOString().slice(0, 16).replace("T", " ")} UTC.`,
          jobId: application.job.id,
          companyId: application.job.companyId,
          interviewerId: slot.interviewerId,
        },
      });
    } catch (notificationError) {
      console.error("[scheduling] booking notification failed", notificationError);
    }

    // T111: candidate confirmation + interviewer alert via Resend.
    try {
      const { deliverBookingConfirmation } = await import(
        "./scheduling-emails"
      );
      const contact = await prisma.applicationIngestionEvent.findFirst({
        where: { applicationId: invite.applicationId },
        orderBy: { id: "desc" },
        select: {
          applicantName: true,
          applicantEmailNormalized: true,
          hostedApplySubmission: {
            select: { name: true, emailNormalized: true },
          },
        },
      });
      const delivery = await deliverBookingConfirmation({
        interviewerEmail:
          application.job.assignedInterviewer?.users?.[0]?.email ?? null,
        interviewerName:
          application.job.assignedInterviewer?.name ?? "Interviewer",
        candidateName:
          contact?.hostedApplySubmission?.name ?? contact?.applicantName ?? "Candidate",
        candidateEmail:
          contact?.hostedApplySubmission?.emailNormalized ??
          contact?.applicantEmailNormalized ??
          "",
        jobTitle: application.job.title,
        companyName: application.job.company.name,
        scheduledAt: slot.startAt,
        durationMinutes: slot.durationMinutes,
      });
      console.info("[scheduling] booking emails", {
        attempted: delivery.attempted,
        sent: delivery.sent,
      });
      await prisma.interview.updateMany({
        where: { id: result.id },
        data: { bookingEmailStatus: delivery.outcome },
      });
    } catch (emailError) {
      console.error("[scheduling] booking emails failed", emailError);
      await prisma.interview.updateMany({
        where: { id: result.id },
        data: { bookingEmailStatus: "PROVIDER_ERROR" },
      });
    }

    return { ok: true, interviewId: result.id, scheduledAt: slot.startAt };
  } catch (error) {
    if (error instanceof SchedulingError && error.code === "SLOT_UNAVAILABLE") {
      return { ok: false, errorCode: "SLOT_UNAVAILABLE" };
    }
    throw error;
  }
}

async function loadLiveInvite(rawToken: string) {
  if (typeof rawToken !== "string" || !rawToken.trim()) return null;
  const tokenHash = hashSecureToken(rawToken);
  const invite = await prisma.interviewBookingInvite.findUnique({
    where: { tokenHash },
    select: { id: true, applicationId: true, expiresAt: true, usedAt: true },
  });
  if (!invite) return null;
  if (invite.usedAt || invite.expiresAt.getTime() < Date.now()) return null;
  return invite;
}

// ---------- shared helpers ----------

function requireInt(value: unknown, code: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (parsed > 0) return parsed;
  }
  throw new SchedulingError(code);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeInterviewType(value: unknown): InterviewType {
  const allowed = ["PHONE_SCREEN", "TECHNICAL", "SYSTEM_DESIGN", "HR"] as const;
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as InterviewType;
  }
  throw new SchedulingError("INTERVIEW_TYPE_INVALID");
}

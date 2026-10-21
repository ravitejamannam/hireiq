import { InterviewSlotStatus, Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { issueBookingInvite } from "@/lib/interviews/scheduling-service";
import { prisma } from "@/lib/prisma";
import { sendCandidateStageEmail, type CandidateEmailOutcome } from "@/lib/screening/candidate-email";

export const WALKTHROUGH_MINUTES = 10;

export type WalkthroughRefusal =
  | "NOT_FOUND"
  | "CLOSED"
  | "NO_PRACTICAL_SUBMISSION"
  | "ALREADY_BOOKED"
  | "NO_INTERVIEWER"
  | "NO_SLOTS"
  | "NO_APP_URL"
  | "ALREADY_INVITED";

type Refused = { ok: false; code: WalkthroughRefusal; error: string };

export type WalkthroughResult =
  | { ok: true; url: string; expiresAt: Date; openSlots: number; resent: boolean; emailOutcome: CandidateEmailOutcome }
  | Refused;

function walkthroughSubject(jobTitle: string) {
  return `Book a 10-minute walkthrough: ${jobTitle}`;
}

function refuse(code: WalkthroughRefusal, error: string): Refused {
  return { ok: false, code, error };
}

/**
 * Invites a candidate who submitted the practical to book a short walkthrough from the job's
 * published slots. A recruiter triggers it; nothing is sent automatically. A live link is not
 * replaced unless `resend` is set, and replacing it stops queued retries of the old email,
 * whose link no longer works.
 */
export async function inviteToWalkthrough(input: {
  jobId: number;
  applicationId: number;
  companyId: number;
  actorUserId: number;
  resend?: boolean;
}): Promise<WalkthroughResult> {
  const now = new Date();
  const decided = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(918275, ${input.applicationId}::int)`);
    const application = await tx.application.findFirst({
      where: { id: input.applicationId, jobId: input.jobId, companyId: input.companyId },
      select: {
        status: true,
        withdrawnAt: true,
        job: { select: { title: true, assignedInterviewerId: true } },
        ingestionEvents: { orderBy: { id: "desc" }, take: 1, select: { applicantEmailNormalized: true } },
      },
    });
    if (!application) return refuse("NOT_FOUND", "Application not found.");
    if (application.withdrawnAt || application.status === "REJECTED" || application.status === "HIRED") {
      return refuse("CLOSED", "This application is closed.");
    }
    const submitted = await tx.codingTest.count({ where: { applicationId: input.applicationId, submittedAt: { not: null } } });
    if (submitted === 0) {
      return refuse("NO_PRACTICAL_SUBMISSION", "The walkthrough comes after the practical. This candidate has not submitted one.");
    }
    const booked = await tx.interviewSlot.findFirst({
      where: { bookedApplicationId: input.applicationId, status: InterviewSlotStatus.BOOKED, startAt: { gt: now } },
      select: { startAt: true },
    });
    if (booked) return refuse("ALREADY_BOOKED", `The candidate already booked ${booked.startAt.toUTCString()}.`);
    if (!application.job.assignedInterviewerId) {
      return refuse("NO_INTERVIEWER", "Assign an interviewer to this job before inviting to a walkthrough.");
    }
    const openSlots = await tx.interviewSlot.count({
      where: { jobId: input.jobId, status: InterviewSlotStatus.OPEN, startAt: { gt: now }, durationMinutes: WALKTHROUGH_MINUTES },
    });
    if (openSlots === 0) {
      return refuse("NO_SLOTS", "No open walkthrough slots. Publish 10-minute slots on the job's Interviews page first.");
    }
    const live = await tx.interviewBookingInvite.findUnique({
      where: { applicationId: input.applicationId },
      select: { usedAt: true, expiresAt: true, createdAt: true },
    });
    if (live && !live.usedAt && live.expiresAt > now && !input.resend) {
      return refuse(
        "ALREADY_INVITED",
        `A booking link is already live until ${live.expiresAt.toUTCString()}. Send a fresh link to replace it.`,
      );
    }
    if (!getPublicAppUrl()) return refuse("NO_APP_URL", "Set APP_URL so a booking link can be built.");
    const invite = await issueBookingInvite(tx, input.applicationId, { requiredDurationMinutes: WALKTHROUGH_MINUTES });
    if (!invite.bookingUrl) throw new Error("Booking link could not be built.");
    return {
      ok: true as const,
      url: invite.bookingUrl,
      expiresAt: invite.expiresAt,
      openSlots,
      replaced: Boolean(live),
      email: application.ingestionEvents[0]?.applicantEmailNormalized ?? null,
      subject: walkthroughSubject(application.job.title),
    };
  });
  if (!decided.ok) return decided;

  if (decided.replaced && decided.email) {
    await prisma.outboundEmailAttempt.updateMany({
      where: { to: decided.email, subject: decided.subject, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "FAILED", nextRetryAt: new Date("2099-01-01T00:00:00.000Z"), lastError: "Replaced by a newer walkthrough link." },
    });
  }
  const emailOutcome = await sendCandidateStageEmail({
    applicationId: input.applicationId,
    companyId: input.companyId,
    subject: walkthroughSubject,
    lines: ({ name, jobTitle, companyName }) => [
      `Hi ${name},`,
      `${companyName} would like a 10-minute call where you walk through your work for ${jobTitle}.`,
      `Pick a time that suits you: ${decided.url}`,
      `The link expires ${decided.expiresAt.toUTCString()}. If none of the times work, reply to this email.`,
    ],
  });
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: input.companyId,
    action: decided.replaced ? "WALKTHROUGH_RESENT" : "WALKTHROUGH_INVITED",
    targetType: "APPLICATION",
    targetId: input.applicationId,
    reason: `${decided.openSlots} open slot(s) | email ${emailOutcome}`,
  });
  return { ok: true, url: decided.url, expiresAt: decided.expiresAt, openSlots: decided.openSlots, resent: decided.replaced, emailOutcome };
}

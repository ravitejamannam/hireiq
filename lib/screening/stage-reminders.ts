import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sendCandidateStageEmail } from "@/lib/screening/candidate-email";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const BATCH = 200;
export const DEADLINE_REMINDER = "DEADLINE_24H";

type Due = {
  companyId: number;
  applicationId: number;
  targetType: "GENERATED_ASSESSMENT_INVITE" | "ASSESSMENT_INVITE" | "CODING_TEST";
  targetId: number;
  deadline: Date;
  what: string;
};

const OPEN_APPLICATION = { withdrawnAt: null, status: { notIn: ["REJECTED", "HIRED"] } } satisfies Prisma.ApplicationWhereInput;

/** Open assessments and practicals whose deadline falls in the next 24 hours, not yet submitted. */
export async function findDueStageReminders(now = new Date(), scope: { companyId?: number } = {}): Promise<Due[]> {
  const until = new Date(now.getTime() + WINDOW_MS);
  const application = scope.companyId ? { ...OPEN_APPLICATION, companyId: scope.companyId } : OPEN_APPLICATION;
  const [generated, bank, practicals] = await Promise.all([
    prisma.generatedAssessmentInvite.findMany({
      where: {
        submittedAt: null,
        startedAt: null,
        expiresAt: { gt: now, lte: until },
        assessment: { status: "PUBLISHED", ...(scope.companyId ? { companyId: scope.companyId } : {}) },
      },
      take: BATCH,
      select: { id: true, applicationId: true, expiresAt: true, assessment: { select: { companyId: true } } },
    }),
    prisma.assessmentInvite.findMany({
      where: {
        submittedAt: null,
        startedAt: null,
        revokedAt: null,
        expiresAt: { gt: now, lte: until },
        application,
      },
      take: BATCH,
      select: { id: true, applicationId: true, expiresAt: true, application: { select: { companyId: true } } },
    }),
    prisma.codingTest.findMany({
      where: {
        submittedAt: null,
        inviteTokenHash: { not: null },
        dueAt: { gt: now, lte: until },
        application,
      },
      take: BATCH,
      select: { id: true, applicationId: true, dueAt: true, application: { select: { companyId: true } } },
    }),
  ]);
  return [
    ...generated.map((row) => ({
      companyId: row.assessment.companyId,
      applicationId: row.applicationId,
      targetType: "GENERATED_ASSESSMENT_INVITE" as const,
      targetId: row.id,
      deadline: row.expiresAt,
      what: "basic assessment",
    })),
    ...bank.map((row) => ({
      companyId: row.application.companyId,
      applicationId: row.applicationId,
      targetType: "ASSESSMENT_INVITE" as const,
      targetId: row.id,
      deadline: row.expiresAt,
      what: "assessment",
    })),
    ...practicals.map((row) => ({
      companyId: row.application.companyId,
      applicationId: row.applicationId,
      targetType: "CODING_TEST" as const,
      targetId: row.id,
      deadline: row.dueAt!,
      what: "practical task",
    })),
  ];
}

/**
 * One reminder per item. The StageReminder insert is the claim, so two
 * overlapping sweeps cannot both send. Closed applications and unsubscribed
 * candidates are recorded and skipped by the email helper.
 */
export async function sendDueStageReminders(now = new Date(), scope: { companyId?: number } = {}) {
  const due = await findDueStageReminders(now, scope);
  const outcomes: Record<string, number> = {};
  let skipped = 0;
  for (const item of due) {
    let reminderId: number;
    try {
      const claimed = await prisma.stageReminder.create({
        data: {
          companyId: item.companyId,
          applicationId: item.applicationId,
          targetType: item.targetType,
          targetId: item.targetId,
          kind: DEADLINE_REMINDER,
          outcome: "claimed",
        },
        select: { id: true },
      });
      reminderId = claimed.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        skipped += 1;
        continue;
      }
      throw error;
    }
    const outcome = await sendCandidateStageEmail({
      applicationId: item.applicationId,
      companyId: item.companyId,
      subject: (jobTitle) => `Reminder: ${item.what} for ${jobTitle} closes soon`,
      lines: ({ name, jobTitle, companyName }) => [
        `Hi ${name},`,
        `This is a reminder that your ${item.what} for ${jobTitle} at ${companyName} closes ${item.deadline.toUTCString()}.`,
        "Use the link in your original invitation email. If you need more time or an accommodation, reply to that email.",
        "If you are no longer interested, you can ignore this message.",
      ],
    }).catch(() => "provider-error" as const);
    await prisma.stageReminder.update({ where: { id: reminderId }, data: { outcome, sentAt: new Date() } });
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  return { due: due.length, skipped, outcomes };
}

import { sendOutboundEmail } from "@/lib/communication/email-transport";
import { reminderInstants } from "@/lib/interviews/slot-calculation";
import { prisma } from "@/lib/prisma";

export function reminderRows(interviewId: number, start: Date) {
  const [day, hour] = reminderInstants(start);
  return [
    { interviewId, kind: "H24", sendAt: day },
    { interviewId, kind: "H1", sendAt: hour },
  ];
}

export async function queueInterviewReminders(interviewId: number, start: Date) {
  const rows = reminderRows(interviewId, start);
  await prisma.interviewReminder.createMany({ data: rows, skipDuplicates: true });
  return rows;
}

export function reminderIsSendable(input: { sendAt: Date; interviewAt: Date; now: Date }) {
  return input.sendAt.getTime() <= input.now.getTime() && input.interviewAt.getTime() > input.now.getTime();
}

export async function sendDueInterviewReminders(now = new Date()) {
  const due = await prisma.interviewReminder.findMany({
    where: { sentAt: null, sendAt: { lte: now }, interview: { interviewAt: { gt: now } } },
    take: 50,
    include: {
      interview: {
        select: {
          id: true,
          interviewAt: true,
          meetUrl: true,
          application: {
            select: {
              candidateTimeZone: true,
              ingestionEvents: {
                orderBy: { id: "desc" },
                take: 1,
                select: { applicantName: true, applicantEmailNormalized: true },
              },
              job: {
                select: {
                  title: true,
                  assignedInterviewer: {
                    select: { name: true, users: { select: { email: true }, take: 1 } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  await prisma.interviewReminder.updateMany({
    where: { sentAt: null, sendAt: { lte: now }, interview: { interviewAt: { lte: now } } },
    data: { sentAt: now },
  });

  let sent = 0;
  for (const row of due) {
    if (!reminderIsSendable({ sendAt: row.sendAt, interviewAt: row.interview.interviewAt, now })) continue;
    const event = row.interview.application.ingestionEvents[0];
    const zone = row.interview.application.candidateTimeZone || "UTC";
    const when = row.interview.interviewAt.toLocaleString("en-IN", { timeZone: zone });
    const meet = row.interview.meetUrl ? `\nMeet: ${row.interview.meetUrl}` : "";
    const text = `Reminder: interview for ${row.interview.application.job.title} at ${when} (${zone}).${meet}`;
    const recipients = [
      event?.applicantEmailNormalized,
      row.interview.application.job.assignedInterviewer?.users[0]?.email,
    ].filter((email): email is string => Boolean(email));
    for (const to of recipients) {
      await sendOutboundEmail({ to, subject: `Interview reminder: ${row.interview.application.job.title}`, text, html: `<p>${text}</p>` });
    }
    await prisma.interviewReminder.update({ where: { id: row.id }, data: { sentAt: now } });
    sent += 1;
  }
  return { due: due.length, sent };
}

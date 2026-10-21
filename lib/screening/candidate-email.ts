import { ApplicationPipelineStatus } from "@prisma/client";

import { sendOutboundEmail } from "@/lib/communication/email-transport";
import { prisma } from "@/lib/prisma";

export type CandidateEmailOutcome = "sent" | "provider-not-configured" | "provider-error" | "no-email" | "unsubscribed" | "closed";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Closed applications and unsubscribed candidates are not emailed. */
export async function sendCandidateStageEmail(input: {
  applicationId: number;
  companyId: number;
  subject: (jobTitle: string, companyName: string) => string;
  lines: (context: { name: string; jobTitle: string; companyName: string }) => string[];
}): Promise<CandidateEmailOutcome> {
  const application = await prisma.application.findFirst({
    where: { id: input.applicationId, companyId: input.companyId },
    select: {
      candidateId: true,
      status: true,
      withdrawnAt: true,
      emailUnsubscribedAt: true,
      job: { select: { title: true, company: { select: { name: true } } } },
      ingestionEvents: {
        orderBy: { id: "desc" },
        take: 1,
        select: { applicantName: true, applicantEmailNormalized: true },
      },
    },
  });
  if (!application) return "closed";
  if (
    application.withdrawnAt ||
    application.status === ApplicationPipelineStatus.REJECTED ||
    application.status === ApplicationPipelineStatus.HIRED
  ) {
    return "closed";
  }
  if (application.emailUnsubscribedAt) return "unsubscribed";
  const event = application.ingestionEvents[0];
  if (!event?.applicantEmailNormalized) return "no-email";
  const context = {
    name: event.applicantName || "there",
    jobTitle: application.job.title,
    companyName: application.job.company.name,
  };
  const lines = input.lines(context);
  const result = await sendOutboundEmail({
    to: event.applicantEmailNormalized,
    subject: input.subject(context.jobTitle, context.companyName),
    text: lines.join("\n\n"),
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
    scope: { companyId: input.companyId, candidateId: application.candidateId },
  });
  return result.sent ? "sent" : result.reason;
}

export function emailOutcomeLabel(outcome: CandidateEmailOutcome) {
  switch (outcome) {
    case "sent":
      return "Email sent to the candidate.";
    case "provider-not-configured":
      return "Email provider is not configured. Share the link with the candidate yourself.";
    case "provider-error":
      return "Email delivery failed and is queued for retry. You can also share the link yourself.";
    case "no-email":
      return "No email address is on file. Share the link with the candidate yourself.";
    case "unsubscribed":
      return "The candidate unsubscribed from email. Share the link another way if appropriate.";
    case "closed":
      return "The application is closed, so no email was sent.";
  }
}

import { ApplicationPipelineStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  sendOutboundEmail,
} from "@/lib/communication/email-transport";

/**
 * Candidate stage-change emails (T117).
 *
 * When an application transitions to a candidate-visible stage, the
 * candidate receives a professional, empathetic email. Best-effort:
 * delivery failures are logged but never block pipeline transitions.
 *
 * Stages that trigger emails: SHORTLISTED, SELECTED, HIRED, REJECTED.
 * Internal stages (CV_POOL → EXPERT_REVIEW etc.) are silent.
 */

const NOTIFIABLE_STAGES = new Set([
  "SHORTLISTED",
  "SELECTED",
  "HIRED",
  "REJECTED",
]);

export class StageChangeEmailError extends Error {}

async function resolveCandidateContact(
  applicationId: number,
): Promise<{ name: string; email: string; jobTitle: string; companyName: string } | null> {
  const event = await prisma.applicationIngestionEvent.findFirst({
    where: { applicationId },
    orderBy: { id: "desc" },
    select: {
      hostedApplySubmission: {
        select: {
          emailNormalized: true,
          name: true,
          job: {
            select: {
              title: true,
              company: { select: { name: true } },
            },
          },
        },
      },
      applicantName: true,
      applicantEmailNormalized: true,
      jobId: true,
      companyId: true,
    },
  });
  if (!event) return null;

  // Resolve from hosted apply submission first, fall back to ingestion event
  const submission = event.hostedApplySubmission;
  if (submission?.emailNormalized) {
    return {
      name: submission.name,
      email: submission.emailNormalized,
      jobTitle: submission.job.title,
      companyName: submission.job.company.name,
    };
  }

  if (event.applicantEmailNormalized) {
    const job = await prisma.job.findUnique({
      where: { id: event.jobId },
      select: { title: true, company: { select: { name: true } } },
    });
    if (!job) return null;
    return {
      name: event.applicantName ?? "Candidate",
      email: event.applicantEmailNormalized,
      jobTitle: job.title,
      companyName: job.company.name,
    };
  }

  return null;
}

function buildStageEmail(
  status: ApplicationPipelineStatus,
  name: string,
  roleTitle: string,
): { subject: string; body: string } {
  switch (status) {
    case "SHORTLISTED":
      return {
        subject: `Great news — you've been shortlisted for ${roleTitle}`,
        body: `Hi ${name.split(" ")[0]},\n\nWe're excited to let you know that you've been shortlisted for the ${roleTitle} role. Our team was impressed by your background.\n\nWe'll be in touch soon with next steps.\n\nBest,\nThe Hiring Team`,
      };
    case "SELECTED":
      return {
        subject: `You've been selected for ${roleTitle}`,
        body: `Hi ${name.split(" ")[0]},\n\nExcellent news — you've been selected for the ${roleTitle} position. The hiring company will reach out with next steps.\n\nCongratulations!\n— The Hiring Team`,
      };
    case "HIRED":
      return {
        subject: `Welcome aboard — ${roleTitle}`,
        body: `Hi ${name.split(" ")[0]},\n\nWelcome to the team! Your hire has been confirmed and our onboarding process will begin shortly.\n\nWe look forward to working with you.\n\nBest,\nThe Hiring Team`,
      };
    case "REJECTED":
      return {
        subject: `Update on your ${roleTitle} application`,
        body: `Hi ${name.split(" ")[0]},\n\nThank you for your interest in the ${roleTitle} role. After careful consideration, we have decided to move forward with other candidates whose experience more closely matches the current requirements.\n\nThis was a competitive decision and we encourage you to apply for future roles.\n\nBest,\nThe Hiring Team`,
      };
    default:
      return { subject: `Update on your application`, body: "Your application status has changed." };
  }
}

/**
 * Best-effort stage-change email. Never throws; failures logged.
 */
export async function notifyCandidateOfStageChange(
  applicationId: number,
  newStatus: ApplicationPipelineStatus,
): Promise<void> {
  if (!NOTIFIABLE_STAGES.has(newStatus)) return;

  try {
    const contact = await resolveCandidateContact(applicationId);
    if (!contact) {
      console.info("[stage-email] no candidate contact resolved", { applicationId });
      return;
    }

    const { subject, body } = buildStageEmail(
      newStatus,
      contact.name,
      contact.jobTitle,
    );

    const result = await sendOutboundEmail({
      to: contact.email,
      subject,
      text: body,
      html: `<p>${body.replaceAll("\n", "<br>")}</p>`,
    });

    if (!result.sent) {
      console.warn("[stage-email] delivery failed", {
        applicationId,
        status: newStatus,
        reason: result.reason,
      });
    } else {
      console.info("[stage-email] delivered", {
        applicationId,
        status: newStatus,
      });
    }
  } catch (error) {
    console.error("[stage-email] unexpected error", error);
  }
}

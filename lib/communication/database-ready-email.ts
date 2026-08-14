import { prisma } from "@/lib/prisma";
import type {
  EmailDeliveryResult,
  RequirementReadyEmailPreview,
} from "@/lib/communication/communication-types";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { sendOutboundEmail } from "@/lib/communication/email-transport";
import { interviewerRequirementPath } from "@/lib/communication/requirement-ready-email";
import { NotificationValidationError } from "@/lib/validation/notification-validation";

type DatabaseReadyEmailContext = {
  jobId: number;
  jobTitle: string;
  companyName: string;
  interviewerName: string;
  to: string | null;
  shortlistingDueAt: Date | null;
};

export function buildDatabaseReadyEmail(context: {
  to: string;
  jobTitle: string;
  companyName: string;
  interviewerName: string;
  jobId: number;
  shortlistingDueAt: Date | null;
}): {
  to: string;
  subject: string;
  text: string;
  html: string;
  preview: RequirementReadyEmailPreview;
} {
  const requirementPath = interviewerRequirementPath(context.jobId);
  const baseUrl = getPublicAppUrl();
  const ctaUrl = baseUrl ? `${baseUrl}${requirementPath}` : null;
  const subject = "HireIQ: Database ready — sourcing window started";
  const slaLine = context.shortlistingDueAt
    ? `The 24-hour shortlisting window ends at ${formatSlaDeadline(context.shortlistingDueAt)}.`
    : "The 24-hour shortlisting window has started.";
  const ctaLine = ctaUrl
    ? `Open the requirement: ${ctaUrl}`
    : `Open HireIQ and go to Interviewer → Requirements → ${context.jobTitle} (${requirementPath}).`;

  const text = [
    `Hello ${context.interviewerName},`,
    "",
    "The sourcing database is ready and the 24-hour sourcing window has started.",
    "",
    `Requirement: ${context.jobTitle}`,
    `Client: ${context.companyName}`,
    "Status: Database ready — sourcing window started",
    slaLine,
    "",
    "Open the requirement workspace to begin sourcing. Database credentials are not included in this email.",
    ctaLine,
    "",
    "This message was sent by HireIQ.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <p style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; margin: 0 0 16px;">HireIQ</p>
      <h1 style="font-size: 20px; margin: 0 0 16px;">Database ready — sourcing window started</h1>
      <p>Hello ${escapeHtml(context.interviewerName)},</p>
      <p>The sourcing database is ready and the 24-hour sourcing window has started.</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Requirement</td>
          <td style="padding: 4px 0; font-weight: 600;">${escapeHtml(context.jobTitle)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Client</td>
          <td style="padding: 4px 0;">${escapeHtml(context.companyName)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Status</td>
          <td style="padding: 4px 0;">Database ready — sourcing window started</td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">SLA</td>
          <td style="padding: 4px 0;">${escapeHtml(slaLine)}</td>
        </tr>
      </table>
      <p>Open the requirement workspace to begin sourcing. Database credentials are not included in this email.</p>
      ${
        ctaUrl
          ? `<p><a href="${escapeHtml(ctaUrl)}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">Open requirement</a></p>`
          : `<p>Open HireIQ and go to <strong>Interviewer → Requirements</strong>.</p>`
      }
      <p style="color: #6b7280; font-size: 12px;">This message was sent by HireIQ. Candidate details are available in the interviewer workspace.</p>
    </div>
  `.trim();

  return {
    to: context.to,
    subject,
    text,
    html,
    preview: {
      to: context.to,
      subject,
      text,
      requirementPath,
    },
  };
}

async function loadDatabaseReadyEmailContext(
  jobId: number,
): Promise<DatabaseReadyEmailContext> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      title: true,
      assignedInterviewerId: true,
      shortlistingDueAt: true,
      company: {
        select: { name: true },
      },
      assignedInterviewer: {
        select: {
          id: true,
          name: true,
          users: {
            where: { role: "INTERVIEWER" },
            select: { email: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!job) {
    throw new NotificationValidationError("Resource not found.");
  }

  if (!job.assignedInterviewerId || !job.assignedInterviewer) {
    throw new NotificationValidationError(
      "Interviewer must be assigned before notification.",
    );
  }

  const readyNotification = await prisma.notification.findUnique({
    where: {
      jobId_interviewerId_type: {
        jobId: job.id,
        interviewerId: job.assignedInterviewer.id,
        type: "INTERVIEWER_DATABASE_READY",
      },
    },
    select: { id: true },
  });

  if (!readyNotification) {
    throw new NotificationValidationError(
      "Database-ready notification does not exist.",
    );
  }

  return {
    jobId: job.id,
    jobTitle: job.title,
    companyName: job.company.name,
    interviewerName: job.assignedInterviewer.name,
    to: job.assignedInterviewer.users[0]?.email ?? null,
    shortlistingDueAt: job.shortlistingDueAt,
  };
}

export async function deliverDatabaseReadyEmail(
  jobId: number,
): Promise<EmailDeliveryResult> {
  let context: DatabaseReadyEmailContext;

  try {
    context = await loadDatabaseReadyEmailContext(jobId);
  } catch (error) {
    if (
      error instanceof NotificationValidationError &&
      error.message.includes("does not exist")
    ) {
      return {
        attempted: false,
        reason: "no-database-ready-notification",
      };
    }

    throw error;
  }

  if (!context.to) {
    return {
      attempted: true,
      sent: false,
      reason: "missing-recipient-email",
      to: null,
    };
  }

  const email = buildDatabaseReadyEmail({
    to: context.to,
    jobTitle: context.jobTitle,
    companyName: context.companyName,
    interviewerName: context.interviewerName,
    jobId: context.jobId,
    shortlistingDueAt: context.shortlistingDueAt,
  });

  const transport = await sendOutboundEmail({
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  if (transport.sent) {
    return {
      attempted: true,
      sent: true,
      provider: "resend",
      to: email.to,
    };
  }

  if (transport.reason === "provider-not-configured") {
    console.info(
      "[communication] database-ready email not sent (provider not configured)",
      {
        to: email.preview.to,
        subject: email.preview.subject,
        requirementPath: email.preview.requirementPath,
      },
    );

    return {
      attempted: true,
      sent: false,
      reason: "provider-not-configured",
      to: email.to,
      preview: email.preview,
    };
  }

  console.error(
    "[communication] database-ready email provider error",
    transport.error,
  );

  return {
    attempted: true,
    sent: false,
    reason: "provider-error",
    to: email.to,
    error: transport.error,
  };
}

function formatSlaDeadline(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

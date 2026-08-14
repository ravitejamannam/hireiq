import { prisma } from "@/lib/prisma";
import type {
  EmailDeliveryResult,
  RequirementReadyEmailPreview,
} from "@/lib/communication/communication-types";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { sendOutboundEmail } from "@/lib/communication/email-transport";
import { NotificationValidationError } from "@/lib/validation/notification-validation";

const CLIENT_SHORTLIST_PATH_PREFIX = "/client/requirements";

export function clientShortlistPath(jobId: number) {
  return `${CLIENT_SHORTLIST_PATH_PREFIX}/${jobId}/shortlist`;
}

export function buildShortlistReadyEmail(context: {
  to: string;
  jobTitle: string;
  companyName: string;
  jobId: number;
  shortlistedCount: number;
}): {
  to: string;
  subject: string;
  text: string;
  html: string;
  preview: RequirementReadyEmailPreview;
} {
  const requirementPath = clientShortlistPath(context.jobId);
  const baseUrl = getPublicAppUrl();
  const ctaUrl = baseUrl ? `${baseUrl}${requirementPath}` : null;
  const subject = "HireIQ: Shortlist ready for review";
  const ctaLine = ctaUrl
    ? `Review the shortlist: ${ctaUrl}`
    : `Open HireIQ and go to Client → Requirements → Shortlist (${requirementPath}).`;

  const text = [
    `Hello ${context.companyName} hiring team,`,
    "",
    "Your shortlist is ready for review.",
    "",
    `Requirement: ${context.jobTitle}`,
    `Shortlisted candidates: ${context.shortlistedCount}`,
    "Status: Shortlist ready",
    "",
    "You can now review candidate profiles, technical evaluations, scores, interviewer notes, HireFit, and HireProbability, then select a candidate.",
    ctaLine,
    "",
    "This message was sent by HireIQ.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <p style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; margin: 0 0 16px;">HireIQ</p>
      <h1 style="font-size: 20px; margin: 0 0 16px;">Shortlist ready for review</h1>
      <p>Hello ${escapeHtml(context.companyName)} hiring team,</p>
      <p>Your shortlist is ready for review.</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Requirement</td>
          <td style="padding: 4px 0; font-weight: 600;">${escapeHtml(context.jobTitle)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Company</td>
          <td style="padding: 4px 0;">${escapeHtml(context.companyName)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Shortlisted candidates</td>
          <td style="padding: 4px 0;">${context.shortlistedCount}</td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Status</td>
          <td style="padding: 4px 0;">Shortlist ready</td>
        </tr>
      </table>
      <p>You can now review candidate profiles, technical evaluations, scores, interviewer notes, HireFit, and HireProbability, then select a candidate.</p>
      ${
        ctaUrl
          ? `<p><a href="${escapeHtml(ctaUrl)}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">Review Shortlist</a></p>`
          : `<p>Open HireIQ and go to <strong>Client → Requirements → Shortlist</strong>.</p>`
      }
      <p style="color: #6b7280; font-size: 12px;">This message was sent by HireIQ. Candidate details are available in the client shortlist workspace.</p>
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

async function loadShortlistReadyEmailContext(jobId: number) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      title: true,
      companyId: true,
      company: {
        select: { name: true },
      },
    },
  });

  if (!job) {
    throw new NotificationValidationError("Resource not found.");
  }

  const readyNotification = await prisma.notification.findUnique({
    where: {
      jobId_companyId_type: {
        jobId: job.id,
        companyId: job.companyId,
        type: "CLIENT_SHORTLIST_READY",
      },
    },
    select: { id: true },
  });

  if (!readyNotification) {
    throw new NotificationValidationError(
      "Shortlist-ready notification does not exist.",
    );
  }

  const clientUser = await prisma.user.findFirst({
    where: {
      companyId: job.companyId,
      role: "CLIENT",
    },
    orderBy: { id: "asc" },
    select: { email: true },
  });

  const shortlistedCount = await prisma.application.count({
    where: {
      jobId: job.id,
      companyId: job.companyId,
      status: "SHORTLISTED",
    },
  });

  return {
    jobId: job.id,
    jobTitle: job.title,
    companyName: job.company.name,
    to: clientUser?.email ?? null,
    shortlistedCount,
  };
}

export async function deliverShortlistReadyEmail(
  jobId: number,
): Promise<EmailDeliveryResult> {
  let context: Awaited<ReturnType<typeof loadShortlistReadyEmailContext>>;

  try {
    context = await loadShortlistReadyEmailContext(jobId);
  } catch (error) {
    if (
      error instanceof NotificationValidationError &&
      error.message.includes("does not exist")
    ) {
      return {
        attempted: false,
        reason: "no-shortlist-ready-notification",
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

  const email = buildShortlistReadyEmail({
    to: context.to,
    jobTitle: context.jobTitle,
    companyName: context.companyName,
    jobId: context.jobId,
    shortlistedCount: context.shortlistedCount,
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
      "[communication] shortlist-ready email not sent (provider not configured)",
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
    "[communication] shortlist-ready email provider error",
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

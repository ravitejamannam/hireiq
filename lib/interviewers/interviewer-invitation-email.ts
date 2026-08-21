import { getPublicAppUrl } from "@/lib/communication/email-config";
import { sendOutboundEmail } from "@/lib/communication/email-transport";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Send after the invitation row is committed.
 * Raw token builds the link only and is not logged.
 */
export async function deliverInterviewerInvitationEmail(input: {
  to: string;
  interviewerName: string;
  rawToken: string;
}) {
  const baseUrl = getPublicAppUrl();
  const invitePath = `/interviewer-invite/${encodeURIComponent(input.rawToken)}`;
  const ctaUrl = baseUrl ? `${baseUrl}${invitePath}` : null;
  const subject = "HireIQ: You were invited as an interviewer";
  const ctaLine = ctaUrl
    ? `Accept the invitation: ${ctaUrl}`
    : "Open the invitation link from this email to set up your HireIQ interviewer account.";

  const text = [
    `You were invited to join HireIQ as an interviewer (${input.interviewerName}).`,
    "",
    ctaLine,
    "",
    "This invitation expires. If you did not expect this email, you can ignore it.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <p>You were invited to join HireIQ as an interviewer
        (<strong>${escapeHtml(input.interviewerName)}</strong>).
      </p>
      ${
        ctaUrl
          ? `<p><a href="${escapeHtml(ctaUrl)}">Accept the invitation</a></p>`
          : `<p>Open the invitation link from this email to set up your account.</p>`
      }
      <p style="color: #6b7280; font-size: 12px;">This invitation expires. If you did not expect this email, you can ignore it.</p>
    </div>
  `.trim();

  return sendOutboundEmail({
    to: input.to,
    subject,
    text,
    html,
  });
}

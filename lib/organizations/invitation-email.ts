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
 * Send the invitation after the invitation row is committed.
 * The raw token is used only to build the link and is not logged.
 */
export async function deliverOrganizationInvitationEmail(input: {
  to: string;
  companyName: string;
  rawToken: string;
}) {
  const baseUrl = getPublicAppUrl();
  const invitePath = `/invite/${encodeURIComponent(input.rawToken)}`;
  const ctaUrl = baseUrl ? `${baseUrl}${invitePath}` : null;
  const subject = "HireIQ: You were invited to a company";
  const ctaLine = ctaUrl
    ? `Accept the invitation: ${ctaUrl}`
    : "Sign in to HireIQ and open the invitation link from this email.";

  const text = [
    `You were invited to join ${input.companyName} on HireIQ.`,
    "",
    ctaLine,
    "",
    "This invitation expires. If you did not expect this email, you can ignore it.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <p>You were invited to join <strong>${escapeHtml(input.companyName)}</strong> on HireIQ.</p>
      ${
        ctaUrl
          ? `<p><a href="${escapeHtml(ctaUrl)}">Accept the invitation</a></p>`
          : `<p>Sign in to HireIQ and open the invitation link from this email.</p>`
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

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
 * The raw token is used only to build the link and is never logged.
 */
export async function deliverEmailVerificationEmail(input: {
  to: string;
  rawToken: string;
}) {
  const baseUrl = getPublicAppUrl();
  const verifyPath = `/verify-email/${encodeURIComponent(input.rawToken)}`;
  const ctaUrl = baseUrl ? `${baseUrl}${verifyPath}` : null;
  const subject = "HireIQ: Verify your email";
  const ctaLine = ctaUrl
    ? `Verify your email: ${ctaUrl}`
    : "Sign in to HireIQ and open the verification link from this email.";

  const text = [
    "Verify your HireIQ email address to continue onboarding.",
    "",
    ctaLine,
    "",
    "This link expires. If you did not create a HireIQ account, you can ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <p>Verify your HireIQ email address to continue onboarding.</p>
      ${
        ctaUrl
          ? `<p><a href="${escapeHtml(ctaUrl)}">Verify email</a></p>`
          : `<p>Sign in to HireIQ and open the verification link from this email.</p>`
      }
      <p style="color: #6b7280; font-size: 12px;">This link expires. If you did not create a HireIQ account, you can ignore this email.</p>
    </div>
  `.trim();

  return sendOutboundEmail({
    to: input.to,
    subject,
    text,
    html,
  });
}

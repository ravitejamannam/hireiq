import { getEmailFromAddress } from "@/lib/communication/email-config";
import { sendOutboundEmail } from "@/lib/communication/email-transport";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getOpsEmail() {
  return process.env.HIREIQ_OPS_EMAIL?.trim() || getEmailFromAddress();
}

export async function notifyHireIqOpsOfNewCompany(input: {
  companyId: number;
  companyName: string;
  ownerUserId: number;
  ownerEmail: string;
}) {
  const to = getOpsEmail();
  if (!to) {
    console.info("[onboarding] company_created_ops_email", {
      companyId: input.companyId,
      ownerUserId: input.ownerUserId,
      sent: false,
      reason: "provider-not-configured",
    });
    return { sent: false as const, reason: "missing-recipient" as const };
  }

  const subject = `HireIQ: New company ${input.companyName}`;
  const text = [
    "A new HireIQ company was created.",
    "",
    `Company: ${input.companyName} (id=${input.companyId})`,
    `Owner user id: ${input.ownerUserId}`,
    `Owner email: ${input.ownerEmail}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <p>A new HireIQ company was created.</p>
      <p><strong>${escapeHtml(input.companyName)}</strong> (id=${input.companyId})</p>
      <p>Owner user id: ${input.ownerUserId}<br/>Owner email: ${escapeHtml(input.ownerEmail)}</p>
    </div>
  `.trim();

  const delivery = await sendOutboundEmail({
    to,
    subject,
    text,
    html,
  });

  console.info("[onboarding] company_created_ops_email", {
    companyId: input.companyId,
    ownerUserId: input.ownerUserId,
    sent: delivery.sent,
    reason: delivery.sent ? "sent" : delivery.reason,
  });

  return delivery;
}

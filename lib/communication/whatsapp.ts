export function normalizeWhatsAppPhone(phone: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  if (!/^\+\d{10,15}$/.test(digits)) return null;
  return digits;
}

export function whatsAppMessage(input: { kind: "interview" | "stage"; title: string; detail: string }) {
  if (input.kind === "interview") {
    return `HireIQ: your interview for ${input.title} is ${input.detail}. Reply STOP to opt out.`;
  }
  return `HireIQ: ${input.title} — ${input.detail}. Reply STOP to opt out.`;
}

export function whatsAppTemplateName(kind: "interview" | "stage") {
  const name = kind === "interview" ? process.env.WHATSAPP_TEMPLATE_INTERVIEW : process.env.WHATSAPP_TEMPLATE_STAGE;
  return name?.trim() || null;
}

/**
 * Outbound reminders sit outside WhatsApp's 24-hour reply window, so Meta
 * only accepts a pre-approved template. Free-form text is not sent.
 */
export async function sendWhatsApp(input: {
  to: string;
  optedIn: boolean;
  templateName: string | null;
  parameters: string[];
}) {
  if (!input.optedIn) return { sent: false as const, reason: "not-opted-in" };
  if (!input.templateName) return { sent: false as const, reason: "template-required" };
  const phone = normalizeWhatsAppPhone(input.to);
  if (!phone) return { sent: false as const, reason: "invalid-phone" };
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) return { sent: false as const, reason: "not-configured" };
  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace("+", ""),
      type: "template",
      template: {
        name: input.templateName,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en" },
        components: [{
          type: "body",
          parameters: input.parameters.slice(0, 4).map((text) => ({ type: "text", text: text.slice(0, 200) })),
        }],
      },
    }),
  });
  if (!response.ok) return { sent: false as const, reason: `provider-${response.status}` };
  return { sent: true as const, reason: null };
}

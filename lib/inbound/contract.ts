import { webhookSignatureMatches } from "@/lib/api/partner-webhook";
import { INBOUND_MESSAGE_MAX_BYTES } from "@/lib/inbound/attachment";
import { hashSecureToken } from "@/lib/auth/secure-token";

export type InboundAttachmentInput = { fileName: string; contentBase64: string };

export type InboundEmailEvent = {
  eventId: string;
  recipient: string;
  applicantName: string | null;
  applicantEmail: string | null;
  attachments: InboundAttachmentInput[];
};

export function inboundWebhookSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.INBOUND_EMAIL_WEBHOOK_SECRET?.trim();
  return secret ? secret : null;
}

export function inboundEmailDomain(env: NodeJS.ProcessEnv = process.env) {
  const domain = env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase();
  return domain && /^[a-z0-9.-]+$/.test(domain) ? domain : null;
}

export function inboundConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(inboundWebhookSecret(env) && inboundEmailDomain(env));
}

/** HireIQ's own HMAC boundary. This is not a live mailbox provider. */
export function inboundSignatureMatches(input: {
  secret: string;
  timestamp: string | null;
  body: string;
  signature: string | null;
  now?: number;
}) {
  if (!input.timestamp) return false;
  return webhookSignatureMatches(input.secret, input.timestamp, input.body, input.signature, input.now);
}

export function parseInboundEvent(body: string): { ok: true; event: InboundEmailEvent } | { ok: false; code: string } {
  if (Buffer.byteLength(body) > INBOUND_MESSAGE_MAX_BYTES) return { ok: false, code: "PAYLOAD_TOO_LARGE" };
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return { ok: false, code: "MALFORMED_PAYLOAD" };
  }
  if (!value || typeof value !== "object") return { ok: false, code: "MALFORMED_PAYLOAD" };
  const record = value as Record<string, unknown>;
  const eventId = typeof record.eventId === "string" ? record.eventId.trim() : "";
  const recipient = typeof record.recipient === "string" ? record.recipient.trim() : "";
  if (!eventId || eventId.length > 200 || !recipient || !recipient.includes("@")) {
    return { ok: false, code: "MALFORMED_PAYLOAD" };
  }
  const applicantName = typeof record.applicantName === "string" ? record.applicantName.trim().slice(0, 120) : "";
  const applicantEmail = typeof record.applicantEmail === "string" ? record.applicantEmail.trim().toLowerCase() : "";
  const attachments = Array.isArray(record.attachments) ? record.attachments : [];
  const parsedAttachments: InboundAttachmentInput[] = [];
  for (const item of attachments) {
    if (!item || typeof item !== "object") return { ok: false, code: "MALFORMED_PAYLOAD" };
    const file = item as Record<string, unknown>;
    const fileName = typeof file.fileName === "string" ? file.fileName : "attachment";
    const contentBase64 = typeof file.contentBase64 === "string" ? file.contentBase64 : "";
    parsedAttachments.push({ fileName, contentBase64 });
  }
  return {
    ok: true,
    event: {
      eventId,
      recipient,
      applicantName: applicantName.length >= 2 ? applicantName : null,
      applicantEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail) ? applicantEmail : null,
      attachments: parsedAttachments,
    },
  };
}

export function recipientTokenHash(recipient: string, domain: string | null) {
  const at = recipient.lastIndexOf("@");
  if (at <= 0) return null;
  const local = recipient.slice(0, at);
  const host = recipient.slice(at + 1).toLowerCase();
  if (!local || !host) return null;
  if (domain && host !== domain) return null;
  return hashSecureToken(local);
}

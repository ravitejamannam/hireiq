import { getPublicAppUrl } from "@/lib/communication/email-config";
import {
  sendOutboundEmail,
} from "@/lib/communication/email-transport";

/**
 * Scheduling emails (T111).
 *
 * Two sends per completed booking, both best-effort:
 * 1. Candidate confirmation — the candidate is unauthenticated, so email
 *    is their only durable record of the booking.
 * 2. Interviewer alert — assigned interviewers are reached through their
 *    linked User account's email.
 *
 * Fail-open: when Resend isn't configured, sends return
 * provider-not-configured and callers log — bookings are never blocked
 * by email delivery.
 */

export type BookingEmailInput = {
  interviewerEmail: string | null;
  interviewerName: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  companyName: string;
  scheduledAt: Date;
  durationMinutes: number;
  meetUrl?: string | null;
  candidateUnsubscribed?: boolean;
};

function fmt(date: Date): string {
  return date.toLocaleString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: undefined,
  }) + " UTC";
}

export function buildBookingEmails(
  input: BookingEmailInput,
): Array<{ to: string; subject: string; text: string; html: string }> {
  const when = fmt(input.scheduledAt);
  const role = `${input.jobTitle} — ${input.companyName}`;

  const candidate = {
    to: input.candidateEmail,
    subject: `Interview confirmed: ${role}`,
    text: [
      `Hi ${input.candidateName},`,
      ``,
      `Your interview for ${role} is confirmed.`,
      ``,
      `When: ${when}`,
      `Duration: ${input.durationMinutes} minutes`,
      `Interviewer: ${input.interviewerName}`,
      input.meetUrl ? `Google Meet: ${input.meetUrl}` : "",
      ``,
      `Good luck!`,
      `— HireIQ on behalf of ${input.companyName}`,
    ].join("\n"),
    html: [
      `<p>Hi <strong>${input.candidateName}</strong>,</p>`,
      `<p>Your interview for <strong>${role}</strong> is confirmed.</p>`,
      `<ul><li><strong>When:</strong> ${when}</li>`,
      `<li><strong>Duration:</strong> ${input.durationMinutes} minutes</li>`,
      `<li><strong>Interviewer:</strong> ${input.interviewerName}</li></ul>`,
      `<p>Good luck!<br>— HireIQ on behalf of ${input.companyName}</p>`,
    ].join(""),
  };

  const interviewer = {
    to: input.interviewerEmail ?? "",
    subject: `New interview booked: ${input.candidateName} — ${input.jobTitle}`,
    text: [
      `Hi ${input.interviewerName},`,
      ``,
      `${input.candidateName} booked a slot for ${role}.`,
      ``,
      `When: ${when}`,
      `Duration: ${input.durationMinutes} minutes`,
      `Candidate email: ${input.candidateEmail}`,
      ``,
      `— HireIQ`,
    ].join("\n"),
    html: [
      `<p>Hi <strong>${input.interviewerName}</strong>,</p>`,
      `<p><strong>${input.candidateName}</strong> booked an interview slot for <strong>${role}</strong>.</p>`,
      `<ul><li><strong>When:</strong> ${when}</li>`,
      `<li><strong>Candidate email:</strong> ${input.candidateEmail}</li></ul>`,
      `<p>— HireIQ</p>`,
    ].join(""),
  };

  return input.interviewerEmail
    ? [candidate, interviewer]
    : [candidate];
}

/** Best-effort send. Never throws; results are logged by callers. */
export async function deliverBookingConfirmation(
  input: BookingEmailInput,
): Promise<{
  attempted: number;
  sent: number;
  outcome: "SENT" | "PROVIDER_NOT_CONFIGURED" | "MISSING_RECIPIENT" | "PROVIDER_ERROR";
}> {
  let sent = 0;
  let outcome: "SENT" | "PROVIDER_NOT_CONFIGURED" | "MISSING_RECIPIENT" | "PROVIDER_ERROR" =
    input.candidateEmail.trim() ? "SENT" : "MISSING_RECIPIENT";
  const emails = buildBookingEmails(input);
  if (input.candidateUnsubscribed) emails.splice(0, 1);

  const order = [emails[0], emails[1]];
  for (const email of order) {
    if (!email?.to) continue;
    try {
      const result = await sendOutboundEmail(email);
      if (result.sent) {
        sent += 1;
      } else if (outcome !== "PROVIDER_ERROR") {
        outcome = result.reason === "provider-not-configured"
          ? "PROVIDER_NOT_CONFIGURED"
          : "PROVIDER_ERROR";
      }
    } catch {
      outcome = "PROVIDER_ERROR";
    }
  }

  void getPublicAppUrl;
  if (!input.candidateEmail.trim()) {
    outcome = outcome === "SENT" ? "MISSING_RECIPIENT" : outcome;
  } else if (sent === 0 && outcome === "SENT") {
    outcome = "MISSING_RECIPIENT";
  }
  return { attempted: emails.length, sent, outcome };
}

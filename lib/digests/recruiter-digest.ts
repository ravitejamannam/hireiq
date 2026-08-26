import { prisma } from "@/lib/prisma";
import { sendOutboundEmail } from "@/lib/communication/email-transport";

/**
 * Recruiter digest (T123): daily pipeline activity summary delivered
 * via email and/or Slack incoming webhook. Designed to be triggered
 * by an external cron hitting POST /api/digest/send.
 */

export type DigestPayload = {
  ok: true;
  email: { attempted: boolean; sent: boolean; reason?: string };
  slack: { attempted: boolean; sent: boolean; reason?: string };
  stats: {
    newApplications: number;
    shortlisted: number;
    rejected: number;
    hired: number;
    assessmentsCompleted: number;
    openRequirements: number;
  };
};

function sinceIso(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d;
}

export async function buildDigestStats() {
  const since = sinceIso();

  const [newApplications, shortlisted, rejected, hired] =
    await Promise.all([
      prisma.application.count({ where: { createdAt: { gte: since } } }),
      prisma.application.count({
        where: { status: "SHORTLISTED", updatedAt: { gte: since } },
      }),
      prisma.application.count({
        where: { status: "REJECTED", updatedAt: { gte: since } },
      }),
      prisma.application.count({
        where: { status: "HIRED", updatedAt: { gte: since } },
      }),
    ]);

  return {
    newApplications,
    shortlisted,
    rejected,
    hired,
    assessmentsCompleted: 0,
    openRequirements: await prisma.job.count({
      where: { status: { in: ["OPEN"] as never } },
    }),
  };
}

export function formatDigestText(stats: Awaited<ReturnType<typeof buildDigestStats>>): string {
  const lines = [
    "📊 HireIQ daily digest",
    "",
    `New applications: ${stats.newApplications}`,
    `Shortlisted: ${stats.shortlisted}`,
    `Rejected: ${stats.rejected}`,
    `Hired: ${stats.hired}`,
    `Open requirements: ${stats.openRequirements}`,
  ];
  if (stats.assessmentsCompleted > 0) {
    lines.push(`Assessments completed: ${stats.assessmentsCompleted}`);
  }
  return lines.join("\n");
}

async function sendDigestEmail(
  text: string,
): Promise<{ attempted: boolean; sent: boolean; reason?: string }> {
  const recipient = process.env.DIGEST_EMAIL_TO;
  if (!recipient) {
    return { attempted: false, sent: false, reason: "DIGEST_EMAIL_TO not configured" };
  }
  const result = await sendOutboundEmail({
    to: recipient,
    subject: "HireIQ daily digest",
    text,
    html: `<pre style="font-family:ui-monospace,monospace">${text}</pre>`,
  });
  return {
    attempted: true,
    sent: result.sent,
    reason: result.sent ? undefined : result.reason,
  };
}

async function sendDigestSlack(
  text: string,
): Promise<{ attempted: boolean; sent: boolean; reason?: string }> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return { attempted: false, sent: false, reason: "SLACK_WEBHOOK_URL not configured" };
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return { attempted: true, sent: res.ok, reason: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (error) {
    return {
      attempted: true,
      sent: false,
      reason: error instanceof Error ? error.message : "fetch failed",
    };
  }
}

/**
 * Sends the digest to every configured channel. Never throws —
 * channel failures are reported per-channel in the payload.
 */
export async function sendRecruiterDigest(): Promise<DigestPayload> {
  const stats = await buildDigestStats();
  const text = formatDigestText(stats);

  const [email, slack] = await Promise.all([
    sendDigestEmail(text),
    sendDigestSlack(text),
  ]);

  return { ok: true, email, slack, stats };
}

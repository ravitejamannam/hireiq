import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_REPLAY_WINDOW_MS = 5 * 60 * 1000;

/** Signs `timestamp.body` so a captured delivery cannot be replayed later. */
export function signWebhookBody(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function webhookSignatureMatches(
  secret: string,
  timestamp: string,
  body: string,
  header: string | null,
  now = Date.now(),
) {
  const sent = Date.parse(timestamp);
  if (!header || !Number.isFinite(sent) || Math.abs(now - sent) > WEBHOOK_REPLAY_WINDOW_MS) return false;
  const presented = header.startsWith("sha256=") ? header.slice("sha256=".length) : header;
  const expected = Buffer.from(signWebhookBody(secret, timestamp, body));
  const actual = Buffer.from(presented);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export type StageWebhook = {
  event: "application.stage_changed";
  companyId: number;
  applicationId: number;
  jobId: number;
  fromStatus: string;
  toStatus: string;
  occurredAt: string;
};

export function stageWebhookBody(input: Omit<StageWebhook, "event" | "occurredAt"> & { occurredAt?: string }): StageWebhook {
  return {
    event: "application.stage_changed",
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    companyId: input.companyId,
    applicationId: input.applicationId,
    jobId: input.jobId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
  };
}

import {
  InterviewSlotStatus,
  InterviewType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  decryptCredentialSecret,
  encryptCredentialSecret,
} from "@/lib/crypto/credential-encryption";

/**
 * Google Calendar sync (T115).
 *
 * OAuth code exchange → encrypted token storage → freeBusy query →
 * automatic OPEN slot generation in working hours minus busy intervals.
 *
 * Fail-closed everywhere: unconfigured credentials, expired grants, and
 * provider errors surface as typed results — never silent partial slots.
 *
 * Env contract:
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / (optional) GOOGLE_REDIRECT_URI
 */

const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export class CalendarSyncError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

function clientConfig() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!id || !secret) {
    throw new CalendarSyncError("NOT_CONFIGURED", "Google Calendar is not configured.");
  }
  return { clientId: id, clientSecret: secret };
}

export function isCalendarSyncConfigured(): boolean {
  try {
    clientConfig();
    return true;
  } catch {
    return false;
  }
}

export function redirectUri(requestOrigin: string): string {
  return (
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    `${requestOrigin}/api/integrations/google/callback`
  );
}

/** Step 1: the URL the interviewer's browser is redirected to. */
export function buildGoogleAuthUrl(input: {
  userId: number;
  requestOrigin: string;
}): string {
  const { clientId } = clientConfig();
  const state = Buffer.from(
    JSON.stringify({ userId: input.userId, origin: input.requestOrigin }),
  ).toString("base64url");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(input.requestOrigin),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

type Tokens = { accessToken: string; refreshToken: string; expiresAt: Date };

async function exchangeCodeOrRefresh(
  body: Record<string, string>,
): Promise<Tokens> {
  const { clientId, clientSecret } = clientConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }),
  });
  if (!res.ok) {
    throw new CalendarSyncError(
      "TOKEN_EXCHANGE_FAILED",
      `Google token endpoint returned ${res.status}.`,
    );
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new CalendarSyncError("TOKEN_EXCHANGE_FAILED", "No access_token in response.");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? "",
    // Google access tokens live ~1h; refresh proactively at 50m.
    expiresAt: new Date(Date.now() + Math.min(json.expires_in ?? 3600, 3000) * 1000),
  };
}

async function validAccessToken(userId: number): Promise<string> {
  const integration = await prisma.interviewerCalendarIntegration.findUnique({
    where: { userId },
  });
  if (!integration) throw new CalendarSyncError("NOT_CONNECTED");

  if (integration.expiresAt.getTime() > Date.now() + 60_000) {
    return decryptCredentialSecret(integration.accessTokenEnc);
  }

  // Refresh
  const refreshed = await exchangeCodeOrRefresh({
    refresh_token: decryptCredentialSecret(integration.refreshTokenEnc),
    grant_type: "refresh_token",
  });
  await prisma.interviewerCalendarIntegration.update({
    where: { userId },
    data: {
      accessTokenEnc: encryptCredentialSecret(refreshed.accessToken),
      expiresAt: refreshed.expiresAt,
    },
  });
  return refreshed.accessToken;
}

// ── Free/busy → slot generation ──

export type GeneratedSlotPlan = {
  startAt: Date;
  durationMinutes: number;
};

/**
 * Compute OPEN slot proposals for a window: working hours (configurable)
 * split into fixed-length slots minus Google-reported busy intervals.
 * Pure function — unit-testable without any provider.
 */
export function proposeSlotsFromFreeBusy(input: {
  windowStart: Date;
  days: number;
  busy: Array<{ start: string | Date; end: string | Date }>;
  slotMinutes?: number;
  workHoursUTC?: { startHour: number; endHour: number };
  workDays?: number[]; // 0=Sun .. 6=Sat (default Mon-Fri)
}): GeneratedSlotPlan[] {
  const slotMinutes = input.slotMinutes ?? 60;
  const { startHour, endHour } = input.workHoursUTC ?? { startHour: 9, endHour: 17 };
  const workDays = input.workDays ?? [1, 2, 3, 4, 5];

  const busy = input.busy
    .map((b) => ({
      start: new Date(b.start).getTime(),
      end: new Date(b.end).getTime(),
    }))
    .sort((a, b) => a.start - b.end);

  const proposals: GeneratedSlotPlan[] = [];
  const dayMs = 86400000;

  for (let d = 0; d < input.days; d++) {
    const dayStart = new Date(input.windowStart.getTime() + d * dayMs);
    if (!workDays.includes(dayStart.getUTCDay())) continue;

    const windowStart = Date.UTC(
      dayStart.getUTCFullYear(),
      dayStart.getUTCMonth(),
      dayStart.getUTCDate(),
      startHour,
      0,
      0,
    );
    const windowEnd = Date.UTC(
      dayStart.getUTCFullYear(),
      dayStart.getUTCMonth(),
      dayStart.getUTCDate(),
      endHour,
      0,
      0,
    );

    let cursor = windowStart;
    while (cursor + slotMinutes * 60_000 <= windowEnd) {
      const slotEnd = cursor + slotMinutes * 60_000;
      const overlaps = busy.some((b) => b.start < slotEnd && b.end > cursor);
      if (!overlaps) {
        proposals.push({
          startAt: new Date(cursor),
          durationMinutes: slotMinutes,
        });
      }
      cursor = slotEnd;
    }
  }

  return proposals.filter((p) => p.startAt.getTime() > Date.now());
}

/** Query Google freeBusy and persist generated OPEN slots for a job. */

function requirePositiveInt(value: unknown, code: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (parsed > 0) return parsed;
  }
  throw new CalendarSyncError(code);
}

/** Admin wrapper (auth enforced here, core logic reusable). */
export async function runCalendarSlotSyncForAdmin(input: {
  jobId: unknown;
  days?: unknown;
}): Promise<{ created: number }> {
  const { requireAdmin } = await import("@/lib/auth/authorization");
  await requireAdmin();
  return syncSlotsCore(input);
}

async function syncSlotsCore(input: {
  jobId: unknown;
  days?: unknown;
}): Promise<{ created: number }> {
  const jobId = requirePositiveInt(input.jobId, "INVALID_JOB_ID");
  const days =
    typeof input.days === "number" && Number.isInteger(input.days) && input.days > 0
      ? Math.min(input.days, 14)
      : 7;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      assignedInterviewerId: true,
      assignedInterviewer: {
        select: {
          users: { select: { id: true }, take: 1 },
        },
      },
    },
  });
  const jobData = job;
  const assignedInterviewerId = jobData?.assignedInterviewerId;
  if (!assignedInterviewerId || !job) {
    throw new CalendarSyncError("NO_ASSIGNED_INTERVIEWER");
  }
  const linkedUser = job.assignedInterviewer?.users[0];
  if (!linkedUser) throw new CalendarSyncError("INTERVIEWER_HAS_NO_LOGIN");

  const accessToken = await validAccessToken(linkedUser.id);

  const windowStart = new Date();
  const fbRes = await fetch(FREEBUSY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: windowStart.toISOString(),
      timeMax: new Date(Date.now() + days * 86400000).toISOString(),
      items: [{ id: "primary" }],
    }),
  });
  if (!fbRes.ok) {
    throw new CalendarSyncError(
      "FREEBUSY_FAILED",
      `Google freeBusy returned ${fbRes.status}.`,
    );
  }
  const fbJson = (await fbRes.json()) as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
  };
  const busy = fbJson.calendars?.primary?.busy ?? [];

  const proposals = proposeSlotsFromFreeBusy({ windowStart, days, busy, slotMinutes: 60 });

  const existing = await prisma.interviewSlot.findMany({
    where: { interviewerId: assignedInterviewerId },
    select: { startAt: true },
  });
  const taken = new Set(existing.map((e) => e.startAt.toISOString()));
  const fresh = proposals.filter((p) => !taken.has(p.startAt.toISOString()));

  const created = await prisma.interviewSlot.createMany({
    data: fresh.map((p) => ({
      jobId,
      interviewerId: assignedInterviewerId,
      interviewType: InterviewType.TECHNICAL as InterviewType,
      startAt: p.startAt,
      durationMinutes: p.durationMinutes,
      status: InterviewSlotStatus.OPEN,
    })),
    skipDuplicates: true,
  });

  await prisma.interviewerCalendarIntegration.updateMany({
    where: { userId: linkedUser.id },
    data: { lastSyncedAt: new Date() },
  });

  return { created: fresh.length };
}

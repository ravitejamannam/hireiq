import { prisma } from "@/lib/prisma";
import { encryptCredentialSecret, decryptCredentialSecret } from "@/lib/crypto/credential-encryption";

const AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
export const MICROSOFT_CALENDAR_SCOPES = ["offline_access", "Calendars.ReadWrite"].join(" ");

export class MicrosoftCalendarError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export function isMicrosoftCalendarConfigured() {
  return Boolean(process.env.MICROSOFT_CLIENT_ID?.trim() && process.env.MICROSOFT_CLIENT_SECRET?.trim());
}

export function microsoftRedirectUri(origin: string) {
  return process.env.MICROSOFT_REDIRECT_URI?.trim() || `${origin}/api/integrations/microsoft/callback`;
}

export function buildMicrosoftAuthUrl(input: { userId: number; requestOrigin: string }) {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  if (!clientId) throw new MicrosoftCalendarError("NOT_CONFIGURED", "Microsoft 365 calendar is not configured.");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: microsoftRedirectUri(input.requestOrigin),
    response_mode: "query",
    scope: MICROSOFT_CALENDAR_SCOPES,
    state: Buffer.from(JSON.stringify({ userId: input.userId })).toString("base64url"),
    prompt: "consent",
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

async function tokenRequest(body: Record<string, string>) {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim() ?? "";
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }),
  });
  if (!response.ok) throw new MicrosoftCalendarError("TOKEN_EXCHANGE_FAILED", `Microsoft token endpoint returned ${response.status}.`);
  const json = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!json.access_token) throw new MicrosoftCalendarError("TOKEN_EXCHANGE_FAILED", "No access_token in response.");
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? "",
    expiresAt: new Date(Date.now() + Math.min(json.expires_in ?? 3600, 3000) * 1000),
  };
}

export async function saveMicrosoftCalendarGrant(input: { userId: number; code: string; requestOrigin: string }) {
  const tokens = await tokenRequest({
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: microsoftRedirectUri(input.requestOrigin),
  });
  await prisma.interviewerCalendarIntegration.upsert({
    where: { userId_provider: { userId: input.userId, provider: "MICROSOFT" } },
    create: {
      userId: input.userId,
      provider: "MICROSOFT",
      grantedScopes: MICROSOFT_CALENDAR_SCOPES,
      accessTokenEnc: encryptCredentialSecret(tokens.accessToken),
      refreshTokenEnc: encryptCredentialSecret(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
    },
    update: {
      grantedScopes: MICROSOFT_CALENDAR_SCOPES,
      accessTokenEnc: encryptCredentialSecret(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken ? encryptCredentialSecret(tokens.refreshToken) : undefined,
      expiresAt: tokens.expiresAt,
    },
  });
}

async function microsoftAccessToken(userId: number) {
  const integration = await prisma.interviewerCalendarIntegration.findFirst({
    where: { userId, provider: "MICROSOFT" },
  });
  if (!integration) throw new MicrosoftCalendarError("NOT_CONNECTED");
  if (integration.expiresAt.getTime() > Date.now() + 60_000) return decryptCredentialSecret(integration.accessTokenEnc);
  const refreshed = await tokenRequest({
    refresh_token: decryptCredentialSecret(integration.refreshTokenEnc),
    grant_type: "refresh_token",
  });
  await prisma.interviewerCalendarIntegration.update({
    where: { id: integration.id },
    data: { accessTokenEnc: encryptCredentialSecret(refreshed.accessToken), expiresAt: refreshed.expiresAt },
  });
  return refreshed.accessToken;
}

export async function createMicrosoftCalendarEvent(input: {
  userId: number;
  summary: string;
  start: Date;
  end: Date;
  attendees: string[];
}) {
  const token = await microsoftAccessToken(input.userId);
  const response = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: input.summary,
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      start: { dateTime: input.start.toISOString(), timeZone: "UTC" },
      end: { dateTime: input.end.toISOString(), timeZone: "UTC" },
      attendees: input.attendees.map((address) => ({ emailAddress: { address }, type: "required" })),
    }),
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { id?: string; onlineMeeting?: { joinUrl?: string } };
  if (!json.id) return null;
  return { eventId: json.id, meetUrl: json.onlineMeeting?.joinUrl ?? null, provider: "MICROSOFT" as const };
}

export async function updateMicrosoftCalendarEvent(input: { userId: number; eventId: string; start: Date; end: Date }) {
  const token = await microsoftAccessToken(input.userId);
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(input.eventId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      start: { dateTime: input.start.toISOString(), timeZone: "UTC" },
      end: { dateTime: input.end.toISOString(), timeZone: "UTC" },
    }),
  });
  return response.ok;
}

export async function deleteMicrosoftCalendarEvent(input: { userId: number; eventId: string }) {
  const token = await microsoftAccessToken(input.userId);
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(input.eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.ok || response.status === 404;
}

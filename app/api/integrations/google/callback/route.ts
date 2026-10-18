import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { encryptCredentialSecret } from "@/lib/crypto/credential-encryption";
import { CALENDAR_OAUTH_SCOPES } from "@/lib/interviews/calendar-sync-service";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/integrations/google/callback — Google redirects here with the
 * authorization code. Exchanges it, encrypts tokens at rest, and links
 * the integration to the requesting admin's User account.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ ok: false, error: "Missing code." }, { status: 400, headers: NO_STORE });
  }

  // Resolve admin from session to bind ownership server-side.
  const sessionCheck = await fetch(new URL("/api/auth/session", url.origin), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  }).then((r) => r.json()).catch(() => null) as { user?: { id?: string; role?: string } } | null;

  if (!sessionCheck?.user?.id || sessionCheck.user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  }
  const userId = Number(sessionCheck.user.id);

  try {
    // Exchange via the shared service internals: reuse token exchange by
    // constructing the same request the service makes.
    const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!.trim();
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI?.trim() ||
      `${url.origin}/api/integrations/google/callback`;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Token exchange failed (${res.status}).` }, { status: 400, headers: NO_STORE });
    }
    const tokens = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.json({ ok: false, error: "Incomplete token response." }, { status: 400, headers: NO_STORE });
    }

    await prisma.interviewerCalendarIntegration.upsert({
      where: { userId },
      update: {
        accessTokenEnc: encryptCredentialSecret(tokens.access_token),
        refreshTokenEnc: encryptCredentialSecret(tokens.refresh_token),
        expiresAt: new Date(Date.now() + Math.min(tokens.expires_in ?? 3600, 3000) * 1000),
        grantedScopes: CALENDAR_OAUTH_SCOPES,
      },
      create: {
        userId,
        accessTokenEnc: encryptCredentialSecret(tokens.access_token),
        refreshTokenEnc: encryptCredentialSecret(tokens.refresh_token),
        expiresAt: new Date(Date.now() + Math.min(tokens.expires_in ?? 3600, 3000) * 1000),
        grantedScopes: CALENDAR_OAUTH_SCOPES,
      },
    });

    const redirectTarget = process.env.APP_URL?.trim() || url.origin;
    return NextResponse.redirect(`${redirectTarget}/dashboard/integrations?google=connected`);
  } catch (error) {
    console.error("[google-callback] failed", error);
    return NextResponse.json({ ok: false, error: "OAuth callback failed." }, { status: 500, headers: NO_STORE });
  }
}

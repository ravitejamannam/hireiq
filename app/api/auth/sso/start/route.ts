import { NextResponse } from "next/server";

import { consumeAuthRateLimit, rateLimitKeyForIp, RateLimitError } from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";
import { emailDomain, ssoConnectionForEmail } from "@/lib/auth/sso";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await consumeAuthRateLimit({ name: "ssoStartIp", key: rateLimitKeyForIp(await readRequestIp()) });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ ok: false, error: "Too many attempts. Try again later." }, { status: 429 });
    }
    throw error;
  }
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!email.includes("@")) return NextResponse.json({ ok: false, error: "Enter your work email." }, { status: 400 });
  const connections = await prisma.companySsoConnection.findMany({
    where: { enabled: true, domain: emailDomain(email) },
  });
  const connection = ssoConnectionForEmail(email, connections.map((row) => ({
    companyId: row.companyId,
    provider: row.provider === "OKTA" ? "OKTA" : "GOOGLE_WORKSPACE",
    domain: row.domain,
    issuer: row.issuer,
    clientId: row.clientId,
    enabled: row.enabled,
  })));
  if (!connection) return NextResponse.json({ ok: false, error: "This email domain is not set up for single sign-on." }, { status: 404 });
  return NextResponse.json({
    ok: true,
    provider: connection.provider,
    issuer: connection.issuer,
    clientId: connection.clientId,
  });
}
